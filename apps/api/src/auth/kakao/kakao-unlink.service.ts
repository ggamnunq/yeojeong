import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuditService } from '../../audit/index.js';
import {
  NotFoundError,
  UnauthenticatedError,
} from '../../common/errors/app-exception.js';
import { getRequestId } from '../../common/logging/request-id.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const AUTH_SCHEME = 'KakaoAK ';
/** 폼 본문은 app_id·user_id·referrer_type 세 개뿐이다 */
const MAX_BODY_BYTES = 4096;
const NUMERIC_ID = /^\d{1,20}$/;
const REFERRER_TYPE = /^[A-Z_]{1,32}$/;

/** 카카오 "연결 끊기 알림" 설정. 값은 로그에 남기지 않는다 */
export class KakaoUnlinkConfig {
  /** Admin 키의 SHA-256(원문은 들고 있지 않는다). null이면 기능 꺼짐 → 404 */
  readonly adminKeyDigest: Buffer | null;
  /** 카카오디벨로퍼스 앱 ID(숫자). 있으면 app_id도 확인한다 */
  readonly appId: string | null;

  constructor(config: ConfigService) {
    const key = config.get<string>('KAKAO_ADMIN_KEY')?.trim() || null;
    if (key && (key.length < 16 || /\s/.test(key))) {
      throw new Error('KAKAO_ADMIN_KEY 형식이 잘못됐습니다');
    }
    this.adminKeyDigest = key ? digest(key) : null;
    const appId = config.get<string>('KAKAO_APP_ID')?.trim() || null;
    if (appId && !NUMERIC_ID.test(appId)) {
      throw new Error('KAKAO_APP_ID는 숫자여야 합니다');
    }
    this.appId = appId;
  }

  get enabled(): boolean {
    return this.adminKeyDigest !== null;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export interface KakaoUnlinkNotice {
  appId: string | null;
  kakaoUserId: string | null;
  referrerType: string | null;
}

export interface KakaoUnlinkResult {
  /** 우리 회원이었는지(응답에는 내보내지 않는다) */
  matched: boolean;
  revokedSessions: number;
}

/**
 * 카카오 "연결 끊기 알림"(기능명세 7-1). 사용자가 카카오 계정 설정에서 「여정」 연결을 끊으면 카카오가 서버 간으로 부른다.
 * 미결 Q-32(탈퇴로 볼지) 결정 전 기본안을 따른다: **세션 전체 폐기 + 운영 알림**만 한다. 데이터는 지우지 않는다.
 * 회원은 다시 카카오로 로그인하면(같은 회원번호) 그대로 이어서 쓰고, 탈퇴를 원하면 서비스 내 탈퇴(FR-109)를 쓴다.
 * Q-32가 "탈퇴"로 확정되면 handle()에서 AccountDeletionService(S2D)를 부르면 된다(같은 파이프라인, 멱등).
 */
@Injectable()
export class KakaoUnlinkService {
  private readonly logger = new Logger(KakaoUnlinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: KakaoUnlinkConfig,
    private readonly audit: AuditService,
  ) {}

  /** KAKAO_ADMIN_KEY가 없으면 기능이 꺼진 것으로 보고 404 */
  assertEnabled(): void {
    if (!this.config.enabled) throw new NotFoundError();
  }

  /** Admin 키·앱 ID가 틀리면 401. 어느 쪽이 틀렸는지는 응답에 알려 주지 않는다 */
  authenticate(req: Request, appId: string | null): void {
    const expected = this.config.adminKeyDigest;
    if (!expected) throw new NotFoundError();
    const header = req.headers.authorization;
    const provided =
      typeof header === 'string' && header.startsWith(AUTH_SCHEME)
        ? header.slice(AUTH_SCHEME.length).trim()
        : '';
    // 길이가 달라도 같은 길이(SHA-256)로 비교해 비교 시간으로 키 정보가 새지 않게 한다
    const keyOk = timingSafeEqual(digest(provided), expected);
    const appOk = this.config.appId === null || appId === this.config.appId;
    if (!keyOk || !appOk) {
      this.logger.warn(
        { keyOk, appOk, requestId: getRequestId(req) },
        '카카오 연결 끊기 알림 인증 실패',
      );
      throw new UnauthenticatedError();
    }
  }

  /** GET은 쿼리, POST는 application/x-www-form-urlencoded 본문(+쿼리). JSON 본문 파서는 폼을 건드리지 않는다 */
  async readNotice(req: Request): Promise<KakaoUnlinkNotice> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') params.set(key, value);
    }
    if (req.method === 'POST') {
      const type = req.headers['content-type'] ?? '';
      if (type.startsWith('application/x-www-form-urlencoded')) {
        const body = await readBody(req, MAX_BODY_BYTES);
        for (const [key, value] of new URLSearchParams(body)) {
          params.set(key, value);
        }
      } else if (req.body && typeof req.body === 'object') {
        for (const [key, value] of Object.entries(
          req.body as Record<string, unknown>,
        )) {
          if (typeof value === 'string' || typeof value === 'number') {
            params.set(key, String(value));
          }
        }
      }
    }
    const pick = (name: string, pattern: RegExp) => {
      const value = params.get(name)?.trim();
      return value && pattern.test(value) ? value : null;
    };
    return {
      appId: pick('app_id', NUMERIC_ID),
      kakaoUserId: pick('user_id', NUMERIC_ID),
      referrerType: pick('referrer_type', REFERRER_TYPE),
    };
  }

  /**
   * 그 카카오 회원의 세션을 모두 폐기하고 가입 대기(카카오 닉네임·프사)를 지운다. 여러 번 와도 결과가 같다(멱등).
   * 우리 회원이 아니어도(가입 전·탈퇴 후) 성공으로 답한다(회원 여부를 드러내지 않는다).
   */
  async handle(notice: KakaoUnlinkNotice): Promise<KakaoUnlinkResult> {
    if (!notice.kakaoUserId) {
      this.logger.warn(
        { referrerType: notice.referrerType },
        '카카오 연결 끊기 알림에 회원번호가 없음',
      );
      return { matched: false, revokedSessions: 0 };
    }
    const kakaoId = notice.kakaoUserId;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.signupTicket.deleteMany({ where: { kakaoId } });
      const user = await tx.user.findUnique({
        where: { kakaoId },
        select: { id: true },
      });
      if (!user) return { matched: false, revokedSessions: 0 };
      const revoked = await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          userId: user.id,
          action: 'KAKAO_UNLINKED',
          resourceType: 'USER',
          resourceId: user.id,
          details: { revokedSessions: revoked.count },
        },
        tx,
      );
      return {
        matched: true,
        userId: user.id,
        revokedSessions: revoked.count,
      };
    });
    // 운영 알림(Q-32 기본안): Cloud Logging 경고. 카카오 회원번호는 남기지 않는다
    this.logger.warn(
      {
        event: 'KAKAO_UNLINKED',
        userId: 'userId' in result ? result.userId : null,
        matched: result.matched,
        revokedSessions: result.revokedSessions,
        referrerType: notice.referrerType,
      },
      '카카오 연결 끊기 알림: 세션 폐기(탈퇴 여부는 미결 Q-32 — 운영 확인 필요)',
    );
    return { matched: result.matched, revokedSessions: result.revokedSessions };
  }
}

function readBody(req: Request, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (req.readableEnded) {
      resolve('');
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      // 카카오 알림은 수십 바이트다. 큰 본문은 읽기만 하고 버린 뒤 거부한다
      if (tooLarge) reject(new UnauthenticatedError());
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}
