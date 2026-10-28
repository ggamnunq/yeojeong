import { createHash, randomUUID } from 'node:crypto';
import { kstDateTime } from '../../kst.js';
import {
  PaymentProviderAdapter,
  ProviderError,
  type AuthorizeHint,
  type ProviderPaymentMethod,
  type ProviderTokens,
  type ProviderTransaction,
  type TransactionPage,
} from '../payment-provider.adapter.js';
import {
  DEMO_DEFAULT_ANCHOR,
  DEMO_METHODS,
  DEMO_PERSONA_BY_NICKNAME,
  DEMO_PERSONAS,
  DEMO_TRANSACTIONS,
  demoKrwAmount,
  type DemoPersona,
} from './demo-dataset.js';

/** 사용자 ID → 샘플을 맞출 기준일(그 사용자의 진행 중·예정 여정 시작일, KST "YYYY-MM-DD") */
export type DemoAnchorResolver = (userId: string) => Promise<string | null>;

interface DemoGrant {
  /** 페르소나 */
  p: DemoPersona;
  /** 우리 서비스 사용자 ID(기준일 조회용) */
  u: string;
}

const PAGE_SIZE = 50;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function isGrant(value: unknown): value is DemoGrant {
  const v = value as Partial<DemoGrant> | null;
  return (
    !!v &&
    typeof v.u === 'string' &&
    DEMO_PERSONAS.includes(v.p as DemoPersona)
  );
}

/** 닉네임이 샘플 멤버면 그 사람, 아니면 사용자 ID로 고정 배정(같은 사용자는 늘 같은 페르소나) */
export function personaFor(hint: AuthorizeHint): DemoPersona {
  const byName = hint.nickname
    ? DEMO_PERSONA_BY_NICKNAME[hint.nickname.trim()]
    : undefined;
  if (byName) return byName;
  const n = createHash('sha256').update(hint.userId).digest()[0];
  return DEMO_PERSONAS[n % DEMO_PERSONAS.length];
}

/**
 * 개발·QA·시연용 토스 대역(기능명세 7-2 DEMO).
 * - 외부 인증은 즉시 성공: authUrl이 바로 우리 콜백으로 돌아온다(code에 페르소나를 담는다).
 * - 결제수단·거래는 demo-dataset.ts를 그 사용자의 여정 시작일에 맞춰 결정적으로 만든다.
 *   거래 ref에 기준일을 넣어, 다른 날짜의 여정에 들어가면 다른 거래로 취급된다.
 */
export class DemoTossAdapter extends PaymentProviderAdapter {
  readonly provider = 'DEMO' as const;

  constructor(
    private readonly anchorFor: DemoAnchorResolver,
    private readonly defaultAnchor: string = DEMO_DEFAULT_ANCHOR,
  ) {
    super();
  }

  buildAuthorizeUrl(input: {
    state: string;
    redirectUri: string;
    hint: AuthorizeHint;
  }): string {
    const url = new URL(input.redirectUri);
    const grant: DemoGrant = { p: personaFor(input.hint), u: input.hint.userId };
    url.searchParams.set('code', `demo.${encode(grant)}`);
    url.searchParams.set('state', input.state);
    return url.toString();
  }

  exchangeCode(input: { code: string; redirectUri: string }): Promise<ProviderTokens> {
    const grant = input.code.startsWith('demo.')
      ? decode<DemoGrant>(input.code.slice(5))
      : null;
    if (!isGrant(grant)) {
      return Promise.reject(new ProviderError('AUTH_FAILED'));
    }
    return Promise.resolve(this.issue(grant));
  }

  refreshTokens(tokens: ProviderTokens): Promise<ProviderTokens> {
    const grant = this.grantOf(tokens.refreshToken, 'demo-rt.');
    if (!grant) return Promise.reject(new ProviderError('AUTH_EXPIRED'));
    return Promise.resolve(this.issue(grant));
  }

  listPaymentMethods(tokens: ProviderTokens): Promise<ProviderPaymentMethod[]> {
    let grant: DemoGrant;
    try {
      grant = this.requireGrant(tokens);
    } catch (error) {
      return Promise.reject(error as Error);
    }
    const ref = (key: string) => `demo.${grant.p}.${key}`;
    return Promise.resolve(
      DEMO_METHODS[grant.p].map((m) => ({
        ref: ref(m.key),
        type: m.type,
        institutionName: m.institutionName,
        productName: m.productName,
        maskedNumber: m.maskedNumber,
        ...(m.linkedAccountKey && { linkedAccountRef: ref(m.linkedAccountKey) }),
      })),
    );
  }

  async listTransactions(
    tokens: ProviderTokens,
    input: { methodRef: string; from: Date; to: Date; cursor?: string },
  ): Promise<TransactionPage> {
    const grant = this.requireGrant(tokens);
    const anchor = (await this.anchorFor(grant.u)) ?? this.defaultAnchor;
    const all = this.generate(grant.p, anchor)
      .filter(
        (t) =>
          t.methodRef === input.methodRef &&
          t.tx.occurredAt >= input.from &&
          t.tx.occurredAt <= input.to,
      )
      .map((t) => t.tx)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const offset = input.cursor ? Number(input.cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ProviderError('INVALID_REQUEST');
    }
    const items = all.slice(offset, offset + PAGE_SIZE);
    const next = offset + PAGE_SIZE;
    return { items, ...(next < all.length && { nextCursor: String(next) }) };
  }

  revoke(): Promise<void> {
    return Promise.resolve();
  }

  /** 페르소나·기준일 → 결제수단 ref별 거래 목록 */
  private generate(persona: DemoPersona, anchor: string) {
    const methodRef = (key: string) => `demo.${persona}.${key}`;
    const txRef = (key: string) => `demo.${persona}.${anchor}.${key}`;
    const out: { methodRef: string; tx: ProviderTransaction }[] = [];
    for (const t of DEMO_TRANSACTIONS[persona]) {
      const occurredAt = kstDateTime(anchor, t.dayOffset, t.time);
      const krwAmount = demoKrwAmount(t.amount, t.currency);
      out.push({
        methodRef: methodRef(t.methodKey),
        tx: {
          ref: txRef(t.key),
          kind: t.kind,
          occurredAt,
          merchantName: t.merchantName,
          amount: t.amount,
          currency: t.currency,
          krwAmount,
          ...(t.approvalOfKey && { approvalRef: txRef(t.approvalOfKey) }),
          raw: { demo: true, ref: txRef(t.key) },
        },
      });
      if (t.mirrorToAccountKey) {
        // 체크카드 승인이 연결 계좌에도 원화 출금으로 잡힌다(20초 뒤)
        out.push({
          methodRef: methodRef(t.mirrorToAccountKey),
          tx: {
            ref: txRef(`${t.key}.account`),
            kind: t.kind,
            occurredAt: new Date(occurredAt.getTime() + 20_000),
            merchantName: t.merchantName,
            amount: String(krwAmount),
            currency: 'KRW',
            krwAmount,
            raw: { demo: true, ref: txRef(`${t.key}.account`) },
          },
        });
      }
    }
    return out;
  }

  private issue(grant: DemoGrant): ProviderTokens {
    const payload = encode(grant);
    return {
      accessToken: `demo-at.${payload}.${randomUUID()}`,
      refreshToken: `demo-rt.${payload}.${randomUUID()}`,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      scope: 'demo:read',
    };
  }

  private grantOf(token: string | undefined, prefix: string): DemoGrant | null {
    if (!token?.startsWith(prefix)) return null;
    const grant = decode<DemoGrant>(token.slice(prefix.length).split('.')[0]);
    return isGrant(grant) ? grant : null;
  }

  private requireGrant(tokens: ProviderTokens): DemoGrant {
    const grant = this.grantOf(tokens.accessToken, 'demo-at.');
    if (!grant) throw new ProviderError('AUTH_EXPIRED');
    return grant;
  }
}
