import { randomInt } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { LEGAL_CONSENT_RELEASES } from '@yeojeong/shared';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import {
  KakaoClient,
  type KakaoProfile,
} from './../src/auth/kakao/kakao.client.js';
import {
  CONSENT_DOCUMENT_VERSIONS,
  currentConsentVersion,
} from './../src/common/auth/index.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import {
  createSession,
  createUser,
  describeWithDb,
  removeUsers,
} from './account-fixtures.js';
import { TEST_ORIGIN } from './auth-helpers.js';

// 약관·동의 0.x 재번호(L-1b): 마이그레이션 20261030020000(sync-legal.mjs가 만든다)이 넣은 행과, 실DB·실제 가드에서
// - 게시 당시 표기 1.0으로 동의한 회원은 동의 기록을 고치지 않아도(1.0 그대로) 0.1·다음 판(재동의 필요 없음) 시행 뒤 막히지 않는지,
// - 가입 동의가 문서별 시행 시각에 바뀌는지(다음 판 게시일은 docs/legal/releases.json — 기대값은 카탈로그로 계산한다).
// 시각은 Date만 바꿔 본다(타이머·DB 시각은 그대로). 고정 시각만 쓰므로 실제 날짜와 무관하다.

class FakeKakao extends KakaoClient {
  constructor(private readonly kakaoId: string) {
    super();
  }

  authorizeUrl(state: string) {
    return `https://kauth.kakao.com/oauth/authorize?response_type=code&state=${state}`;
  }

  fetchProfile(): Promise<KakaoProfile> {
    return Promise.resolve({
      id: this.kakaoId,
      nickname: '영점엑스',
      profileImageUrl: null,
    });
  }
}

const UA = 'yeojeong-l1b-e2e';
const SIGNUP = ['TOS', 'PRIVACY', 'AGE14'] as const;
type SignupId = (typeof SIGNUP)[number];
const kst = (date: string, time = '00:00:00') =>
  new Date(`${date}T${time}+09:00`);
/** 모든 0.x 판이 시행된 뒤(가장 늦은 시행일 다음 날 낮) */
const ALL_IN_FORCE = (() => {
  const last = LEGAL_CONSENT_RELEASES.map((r) => r.effectiveDate)
    .sort((a, b) => a.localeCompare(b))
    .at(-1)!;
  const d = kst(last, '12:00:00');
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
})();

describeWithDb('Terms renumbered to 0.x (e2e, real DB)', () => {
  let app: NestExpressApplication | undefined;
  let db: PrismaService;
  const users: string[] = [];
  const v1 = (id: SignupId) =>
    CONSENT_DOCUMENT_VERSIONS.find(
      (d) => d.consentId === id && d.version === '1.0',
    )!;
  const current = (id: SignupId, now = new Date()) =>
    currentConsentVersion(id, CONSENT_DOCUMENT_VERSIONS, now);

  const at = (when: Date) => vi.useFakeTimers({ toFake: ['Date'], now: when });

  /** 동의 문서 캐시(1분)가 앞 시각의 목록을 들고 있지 않게 시각마다 새 앱으로 본다 */
  async function startApp(kakaoId = '') {
    await app?.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KakaoClient)
      .useValue(new FakeKakao(kakaoId))
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
    setupApp(app);
    await app.init();
    db = app.get(PrismaService);
    return app.getHttpServer();
  }

  /** 게시 당시(2026-10-30) 표기 1.0으로 동의한 회원 */
  async function v1Signer() {
    const user = await createUser(db, { nickname: '일점영동의' });
    users.push(user.id);
    for (const consentId of SIGNUP) {
      await db.userConsent.create({
        data: {
          userId: user.id,
          userRefHash: 'f'.repeat(64),
          consentId,
          version: '1.0',
          agreed: true,
          ua: UA,
          screen: 'WF-04',
          method: 'ALL',
          docHash: v1(consentId).docHash,
        },
      });
    }
    const { token } = await createSession(db, user.id);
    return { userId: user.id, cookie: `yj_session=${token}` };
  }

  /** 카카오 로그인 왕복 → 가입. 동의 버전을 고른다 */
  async function signup(versions: Record<SignupId, string>) {
    const kakaoId = `9${randomInt(1e8, 9e8)}${randomInt(1e5, 9e5)}`;
    const server = await startApp(kakaoId);
    const agent = request.agent(server);
    const started = await agent.get('/api/auth/kakao/start').expect(302);
    const state = new URL(started.headers.location).searchParams.get('state');
    await agent
      .get('/api/auth/kakao/callback')
      .query({ code: 'kakao-code', state })
      .expect(302);
    const res = await agent
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .set('User-Agent', UA)
      .send({
        nickname: '영점엑스',
        agreements: SIGNUP.map((consentId) => ({
          consentId,
          version: versions[consentId],
          agreed: true,
        })),
        method: 'ALL',
      });
    const user = await db.user.findFirst({ where: { kakaoId } });
    if (user) users.push(user.id);
    return { res, user };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    if (!app) await startApp();
    await removeUsers(db, users);
    await db.userConsent.deleteMany({ where: { ua: UA } });
    await app?.close();
  });

  it('the migration added the 0.x rows (0.1 replaces 1.0), backfilled reconsent_required and kept the 1.0 rows', async () => {
    await startApp();
    for (const r of LEGAL_CONSENT_RELEASES) {
      const row = await db.consentDocument.findUnique({
        where: {
          consentId_version: { consentId: r.consentId, version: r.version },
        },
      });
      expect(row, `${r.consentId} ${r.version}`).toMatchObject({
        isDraft: false,
        docPath: r.docPath,
        docHash: r.docHash,
        reconsentRequired: r.reconsentRequired,
        replacesVersion: r.replacesVersion,
      });
      expect(row!.effectiveAt.toISOString()).toBe(
        kst(r.effectiveDate).toISOString(),
      );
    }
    for (const id of SIGNUP) {
      expect(
        await db.consentDocument.findUnique({
          where: { consentId_version: { consentId: id, version: '0.1' } },
        }),
      ).toMatchObject({ replacesVersion: '1.0', reconsentRequired: true });
      // 1.0 행(게시 기록)은 그대로 — 해시도 당시 본문 해시
      expect(
        await db.consentDocument.findUnique({
          where: { consentId_version: { consentId: id, version: '1.0' } },
        }),
      ).toMatchObject({
        docHash: v1(id).docHash,
        reconsentRequired: true,
        replacesVersion: null,
      });
    }
    // 초안 행은 change_type(MAJOR)으로 채웠다
    expect(
      await db.consentDocument.count({
        where: { isDraft: true, reconsentRequired: false },
      }),
    ).toBe(0);
  });

  it.each([
    ['the 0.1 effective date', kst('2026-10-30', '00:00:30')],
    ['after every 0.x version is in force', ALL_IN_FORCE],
  ])(
    'keeps a member who agreed to "1.0" signed in at %s — no CONSENT_REQUIRED, consent rows untouched',
    async (_label, when) => {
      at(when);
      const server = await startApp();
      const { userId, cookie } = await v1Signer();
      // 다음 판이 재동의를 요구하면 막혀야 맞다 — 카탈로그와 같은 판정인지 본다
      const expected = SIGNUP.filter(
        (id) =>
          !LEGAL_CONSENT_RELEASES.filter(
            (r) =>
              r.consentId === id &&
              r.version !== '0.1' &&
              kst(r.effectiveDate) <= when,
          ).every((r) => !r.reconsentRequired),
      );
      const state = await request(server)
        .get('/api/auth/session')
        .set('Cookie', cookie)
        .expect(200);
      expect(state.body.status).toBe('AUTHENTICATED');
      expect(
        (state.body.reconsentRequired as { id: string }[]).map((r) => r.id),
      ).toEqual(expected);
      if (expected.length === 0) {
        const me = await request(server)
          .get('/api/users/me')
          .set('Cookie', cookie)
          .expect(200);
        expect(me.body.nickname).toBe('일점영동의');
      }
      // 동의 기록(append-only)은 당시 표기·당시 해시 그대로
      const rows = await db.userConsent.findMany({ where: { userId } });
      const byId = (a: string[], b: string[]) => a[0].localeCompare(b[0]);
      expect(
        rows.map((r) => [r.consentId, r.version, r.docHash]).sort(byId),
      ).toEqual(SIGNUP.map((id) => [id, '1.0', v1(id).docHash]).sort(byId));
    },
  );

  it('serves the version in force per document for signup (0.1 on 10-30, each later version from its own effective date)', async () => {
    const versions = async (when: Date) => {
      at(when);
      const server = await startApp();
      const docs = await request(server)
        .get('/api/consents/documents?stage=SIGNUP')
        .expect(200);
      return (docs.body as { consentId: string; version: string }[])
        .filter((d) => d.consentId !== 'MARKETING')
        .map((d) => [d.consentId, d.version]);
    };
    for (const when of [
      kst('2026-10-30', '00:00:30'),
      ...LEGAL_CONSENT_RELEASES.flatMap((r) => [
        kst(r.effectiveDate),
        new Date(kst(r.effectiveDate).getTime() - 1000),
      ]),
      ALL_IN_FORCE,
    ]) {
      expect(await versions(when), when.toISOString()).toEqual(
        SIGNUP.map((id) => [id, current(id, when).version]),
      );
      vi.useRealTimers();
    }
  });

  it('records a signup with the versions in force (doc hash of that version) and rejects the old label 1.0', async () => {
    at(ALL_IN_FORCE);
    const stale = await signup({ TOS: '1.0', PRIVACY: '1.0', AGE14: '1.0' });
    expect(stale.res.status).toBe(400);
    expect(stale.res.body).toMatchObject({ code: 'TERMS_REQUIRED' });
    expect(stale.user).toBeNull();

    const now = new Date();
    const want = Object.fromEntries(
      SIGNUP.map((id) => [id, current(id, now).version]),
    ) as Record<SignupId, string>;
    const { res, user } = await signup(want);
    expect(res.status).toBe(201);
    for (const id of SIGNUP) {
      expect(
        await db.userConsent.findFirst({
          where: { userId: user!.id, consentId: id },
        }),
      ).toMatchObject({
        version: want[id],
        agreed: true,
        docHash: current(id, now).docHash,
      });
    }
  });
});
