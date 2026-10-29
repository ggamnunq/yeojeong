import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppException } from '../../common/errors/index.js';
import { CodefConfig } from './codef.config.js';
import {
  CODEF_OAUTH_URL,
  CODEF_OTHER_TIMEOUT_MS,
  CODEF_PATHS,
  CODEF_QUERY_TIMEOUT_MS,
  CODEF_TOKEN_ERRORS,
  CODEF_TOKEN_REFRESH_MARGIN_MS,
} from './codef.constants.js';

/** fetch 주입 토큰. 테스트는 HTTP 목을 넣는다(실제 네트워크 호출 없음). 운영은 Node 기본 fetch(TLS 인증서 검증 그대로) */
export const CODEF_FETCH = Symbol('CODEF_FETCH');
export type CodefFetch = typeof fetch;

/** CODEF API 호출 수를 세는 곳(서비스 일일 예산 — CardImportLimits.recordCodefCall) */
export const CODEF_CALL_COUNTER = Symbol('CODEF_CALL_COUNTER');
export interface CodefCallCounter {
  recordCodefCall(): Promise<void>;
}

/** CODEF 응답 봉투: { result: { code, message, extraMessage, transactionId }, data } */
export interface CodefResponse {
  result: { code: string; message?: string; extraMessage?: string };
  data: unknown;
}

/**
 * 응답 본문 해석. SDK(EasyCodefConnector·v2 ResponseHandler)는 URL 디코딩(UTF-8, '+' → 공백) 뒤 JSON으로 읽는다.
 * 샌드박스는 그냥 JSON을 준다 → '{'로 시작하면 그대로, 아니면 디코딩 뒤 읽는다
 */
export function decodeCodefBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  return JSON.parse(decodeURIComponent(trimmed.replace(/\+/g, ' ')));
}

function isCodefResponse(value: unknown): value is CodefResponse {
  if (typeof value !== 'object' || value === null) return false;
  const result = (value as { result?: unknown }).result;
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as { code?: unknown }).code === 'string'
  );
}

/** 응답 본문 상한(5MB). 넘으면 읽기를 멈추고 실패로 본다 */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** 본문을 상한까지만 읽는다(스트림). 넘으면 예외 */
async function readLimited(res: Response, limit: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await res.body?.cancel();
    throw new RangeError('CODEF 응답이 너무 큽니다');
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RangeError('CODEF 응답이 너무 큽니다');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 통신 실패를 사용자 응답으로 바꾼다. 원래 오류(요청 본문이 붙어 있을 수 있다)는 cause로도 넘기지 않는다 */
const failed = () => AppException.of('CARD_IMPORT_FAILED');

/**
 * CODEF REST 클라이언트(1회성 조회용, 최소 기능).
 * - 요청 본문은 JSON을 URL 인코딩해 보낸다(EasyCodefConnector: URLEncoder.encode(JSON, "UTF-8")). base64 비밀번호의 '+'·'/'도 안전하다.
 * - 액세스 토큰은 메모리에만 두고(개인정보 아님, 1주일 유효) 만료 1시간 전 또는 토큰 오류 코드에 한 번 다시 받는다.
 *   재시도는 이 토큰 재발급(요청이 처리되지 않은 경우)뿐이다. 조회 자체는 다시 보내지 않는다(계정 삭제 재시도는 CodefAccountRemover).
 * - 사용자 자격 증명(아이디·암호문)은 request()의 인자로만 지나가고 클래스 필드·캐시에 두지 않는다.
 * - 요청·응답 본문, 토큰, connectedId는 어떤 로그에도 남기지 않는다. 로그는 경로·결과 코드·소요 시간만.
 */
@Injectable()
export class CodefClient {
  private readonly logger = new Logger(CodefClient.name);
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;

  constructor(
    private readonly config: CodefConfig,
    @Inject(CODEF_FETCH) private readonly fetchFn: CodefFetch,
    @Optional()
    @Inject(CODEF_CALL_COUNTER)
    private readonly counter?: CodefCallCounter,
  ) {}

  async request(
    path: string,
    body: Record<string, unknown>,
  ): Promise<CodefResponse> {
    let response = await this.post(path, body, await this.accessToken());
    if (CODEF_TOKEN_ERRORS.has(response.result.code)) {
      this.token = null;
      response = await this.post(path, body, await this.accessToken());
    }
    return response;
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    token: string,
  ): Promise<CodefResponse> {
    const started = Date.now();
    // 일일 예산: 조회·등록·추가 인증은 새 조회 때 미리 예약한다(CardImportLimits.reserveFetch). 계정 삭제만 여기서 센다
    if (path === CODEF_PATHS.ACCOUNT_DELETE)
      await this.counter?.recordCodefCall();
    let text: string;
    try {
      const res = await this.fetchFn(`${this.config.apiHost}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          // SDK v1은 Content-Type을 따로 정하지 않아 HttpURLConnection 기본값(x-www-form-urlencoded)으로 보낸다
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${token}`,
        },
        body: encodeURIComponent(JSON.stringify(body)),
        signal: AbortSignal.timeout(
          path === CODEF_PATHS.CARD_APPROVAL_LIST
            ? CODEF_QUERY_TIMEOUT_MS
            : CODEF_OTHER_TIMEOUT_MS,
        ),
      });
      text = await readLimited(res, MAX_RESPONSE_BYTES);
    } catch (error) {
      this.logger.warn(
        {
          path,
          errorName: (error as { name?: string }).name,
          ms: Date.now() - started,
        },
        'CODEF 통신 실패',
      );
      throw failed();
    }
    let parsed: unknown;
    try {
      parsed = decodeCodefBody(text);
    } catch {
      parsed = null;
    }
    if (!isCodefResponse(parsed)) {
      this.logger.warn(
        { path, ms: Date.now() - started },
        'CODEF 응답 형식 오류',
      );
      throw failed();
    }
    this.logger.log(
      { path, resultCode: parsed.result.code, ms: Date.now() - started },
      'CODEF 호출',
    );
    return parsed;
  }

  private accessToken(): Promise<string> {
    if (
      this.token &&
      this.token.expiresAt - CODEF_TOKEN_REFRESH_MARGIN_MS > Date.now()
    ) {
      return Promise.resolve(this.token.value);
    }
    this.pendingToken ??= this.issueToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  /** EasyCodefConnector.publishToken: Basic base64(clientId:clientSecret), grant_type=client_credentials&scope=read */
  private async issueToken(): Promise<string> {
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');
    let payload: { access_token?: unknown; expires_in?: unknown };
    try {
      const res = await this.fetchFn(CODEF_OAUTH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
        },
        body: 'grant_type=client_credentials&scope=read',
        signal: AbortSignal.timeout(CODEF_OTHER_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.error({ status: res.status }, 'CODEF 토큰 발급 실패');
        throw failed();
      }
      payload = (await res.json()) as typeof payload;
    } catch (error) {
      if (error instanceof AppException) throw error;
      this.logger.error(
        { errorName: (error as { name?: string }).name },
        'CODEF 토큰 발급 실패',
      );
      throw failed();
    }
    if (
      typeof payload.access_token !== 'string' ||
      payload.access_token === ''
    ) {
      this.logger.error('CODEF 토큰 응답 형식 오류');
      throw failed();
    }
    const seconds =
      typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + seconds * 1000,
    };
    return this.token.value;
  }
}
