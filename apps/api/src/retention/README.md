# 탈퇴 · 파기 배치 · 감사 로그 (`src/account`, `src/retention`, `src/audit`)

기능명세 FR-109(서비스 내 탈퇴), 8-1·8-2(접근 기록·보존 기간), 8-8(파기 배치), 개인정보처리방침 제3조·제7조를 구현한다.

| 메서드 | 경로                       | 권한                          | 하는 일                                                                    |
| ------ | -------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| DELETE | `/api/users/me`            | 로그인(재동의 전에도 가능)    | 본문 `{ "confirm": true }`. 탈퇴 파이프라인 → 204 + `yj_session` 쿠키 삭제 |
| POST   | `/api/internal/jobs/purge` | 내부(Cloud Scheduler OIDC) | 본문 `{ "dryRun"?: boolean }`. 파기 배치 → 200 `PurgeJobResult`            |

공유 타입은 `@yeojeong/shared`의 `api/account.ts`(`DeleteAccountRequest`, `DELETED_MEMBER_NICKNAME`, `PurgeStep`, `PurgeJobResult`).

## 탈퇴 파이프라인 (`AccountDeletionService.deleteAccount`)

서비스 내 탈퇴(`IN_APP`), 고객센터 요청 처리(`SUPPORT`, FR-108), 장기 미이용(`INACTIVE`)이 같은 함수를 쓴다.

1. `account.deleting` 이벤트를 `emitAsync`로 보내고 기다린다(트랜잭션 전). 제공기관 토큰 폐기(wallet), 카카오 연결 끊기(auth) 리스너 자리다. 실패해도 계속한다.
2. 한 트랜잭션:
   - `users` 행 `FOR UPDATE`. 없으면 `ALREADY_DELETED`로 끝난다(동시 요청·재시도 멱등).
   - 활성 멤버십의 Trip 행 `FOR UPDATE`(S2A와 같은 순서: Trip → Membership).
   - 활성 멤버십마다: `userId = NULL`, `leftAt`, `leaveReason = ACCOUNT_DELETED`. 그룹장이면 남은 활성 멤버 중 `joinOrder` 최소에게 LEADER + `TripEvent LEADER_CHANGED`. 남는 활성 멤버가 없으면 그룹·여정 `deletedAt`(29일 경과 후 파기).
   - 나간 멤버십도 `userId = NULL`. 내가 승계받았던 토스트 페이로드의 닉네임은 "탈퇴한 멤버"로 바꾼다.
   - 내 PENDING·PERSONAL 결제(취소 자식 포함), 거래 원본, 결제수단, 연결 시도, 연결(토큰 포함), 세션, 같은 카카오 회원번호의 가입 대기를 지운다. SHARED 결제·부담·정산 행은 Membership ID로 남고 `transactionId`만 NULL이 된다.
   - 동의 이력 `withdrawnAt` + `ACCOUNT_DELETED`(3년 보존 후 파기).
   - `AccountDeletion` 완료 기록. 처리 전인 요청(FR-108)이 있으면 함께 완료로 바꾸고, 같은 경로 요청이 없으면 새 행을 만든다. `userRefHash`는 동의 이력에 있는 값을 그대로 쓴다.
   - `users` 행 삭제. 회원 정보 보존 기간이 "탈퇴까지"라 소프트 삭제하지 않는다. FK가 SET NULL인 동의·처리 기록·멤버십·그룹 생성자는 남는다.
3. 커밋 후 `membership.left`(S2A 모양, `reason: 'DELETED'`, `userId: null`, `eventSeq`)를 멤버십마다 보내고, `account.deleted`를 보낸다.

화면 표시: `Membership.userId = NULL`이면 닉네임은 `DELETED_MEMBER_NICKNAME`, 프사는 기본 이미지다.

## 파기 배치 (`PurgeService`)

매일 03:00 KST(제안) 한 번 부른다. 단계마다 별도 트랜잭션이고 `pg_try_advisory_xact_lock(hashtext('yeojeong:jobs:purge'))`를 잡는다. 못 잡은 단계는 `skipped: 'LOCKED'`로 건너뛴다. 드라이런은 잠그지 않고 세기만 한다. 단계마다 건수만 로그에 남긴다(`파기 단계`).

경계는 `retention-policy.ts`의 `cutoff()`다. 기준 시각이 `now − 기간` **이하**면 대상이다. 일 단위는 24시간 × n, 연 단위는 달력 기준이고 2월 29일은 2월 28일로 당긴다.

처리방침이 "30일 이내 파기"로 고지한 항목(삭제 표시한 그룹·여정, 해제한 결제수단과 연결)은 상수 `WITHIN_30_DAYS`(29일)를 쓴다. 배치가 하루 한 번이라 30일로 잡으면 최대 31일이 걸리기 때문이다.

| #   | 단계 (`PurgeStep`)        | 대상                        | 기준                                                       | 처리                        | 한 번 상한 |
| --- | ------------------------- | --------------------------- | ---------------------------------------------------------- | --------------------------- | ---------- |
| 1   | `SOFT_DELETED_GROUPS`     | Group·Trip과 하위 기록 일체 | `group.deletedAt` 또는 `trip.deletedAt` + 29일             | 영구 삭제                   | 100그룹    |
| 2   | `EXPIRED_GROUP_RECORDS`   | 위와 같음                   | `trip.endedAt`(종료 안 됐으면 `autoEndAt`) + 3년           | 영구 삭제                   | 100그룹    |
| 3   | `RAW_PAYLOADS`            | `Transaction.rawPayloadEnc` | `importedAt` + 90일                                        | NULL                        | 5,000행    |
| 4   | `CONNECTION_ATTEMPTS`     | ConnectionAttempt           | `expiresAt` 지남                                           | 삭제                        | 5,000행    |
| 5   | `SIGNUP_TICKETS`          | SignupTicket                | `expiresAt` 지남                                           | 삭제                        | 5,000행    |
| 5   | `SESSIONS`                | Session                     | `expiresAt` 지남 또는 `revokedAt` 있음                     | 삭제                        | 5,000행    |
| 6   | `REMOVED_PAYMENT_METHODS` | PaymentMethod               | `REMOVED` + `removedAt` + 29일 + 참조 거래 없음            | 삭제                        | 5,000행    |
| 6   | `REVOKED_CONNECTIONS`     | PaymentConnection           | `REVOKED` + 결제수단 없음 + `updatedAt` + 29일             | 삭제(명세 외 추가)          | 5,000행    |
| 7   | `INACTIVE_USERS`          | User                        | `lastLoginAt` + 3년                                        | 탈퇴 파이프라인(`INACTIVE`) | 20명       |
| 8   | `USER_CONSENTS`           | UserConsent                 | `withdrawnAt` + 3년                                        | 삭제                        | 5,000행    |
| 9   | `ACCESS_LOGS`             | AccessLog                   | `at` + 1년                                                 | 삭제                        | 5,000행    |
| 10  | `ACCOUNT_DELETIONS`       | AccountDeletion             | `completedAt` + 3년, 처리 안 된 요청은 `requestedAt` + 3년 | 삭제                        | 5,000행    |
| 11  | `CARD_IMPORT_COUNTERS`    | CardImportLoginFailure · CodefDailyUsage · CardImportLock | 로그인 실패 `lastFailedAt` + 7일, CODEF 일일 호출 수 `day` + 7일, 잠금은 `expiresAt` 지남(S8) | 삭제 | 전부 |
| 12  | `CODEF_PENDING_DELETIONS` | CodefPendingDeletion | `createdAt` + 30일(넘으면 버리고 error 로그). 남은 행이 있으면 매일 error 로그(S8) | 삭제 | 전부 |

- "하위 기록 일체" = ExpenseChangeLog → Expense(ExpenseShare·취소 자식 CASCADE) → Settlement(멤버·송금안 CASCADE) → TripEvent → Trip → Membership → Group. 이 여정의 결제에만 쓰인 거래 원본과, 그 거래를 가리키는 동일 사용자 중복 행(결제가 없는 것)도 지운다. 겹치는 다른 여정이 쓰는 거래는 남긴다.
- 상한에 걸리면 `hasMore: true`이고 다음 실행이 이어서 지운다.
- 동의 기록 IP 평문 이관 단계(`CONSENT_IP_PLAINTEXT`)와 `consent-ip-backfill` 잡은 contract 마이그레이션(`20261029010003_drop_user_consents_ip`, S4)과 함께 지웠다(`prisma/README.md` "동의 기록 IP").
- 운영 로그(Cloud Logging)는 버킷 보존 정책(서울 `yeojeong-app-logs` 93일, 감사 로그 사본 서울 `yeojeong-audit-logs` 400일, `infra/envs/prod/logging.tf`)이 지운다.

### 호출

```bash
curl -X POST http://localhost:3000/api/internal/jobs/purge \
  -H "x-internal-job-secret: $INTERNAL_JOB_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"dryRun": true}'
```

- `@InternalJob()` 공통 가드: 운영은 Cloud Scheduler OIDC, 로컬·테스트는 `x-internal-job-secret` 대체 인증을 쓴다.
- 위 시크릿 방식은 로컬·테스트 전용이다. 운영은 Cloud Scheduler OIDC만 허용한다.

## 감사 로그 (`src/audit`)

`AuditModule`은 전역이다. import 없이 라우트에 메타데이터만 붙이면 전역 `AuditInterceptor`가 **성공한(2xx) 로그인 요청**만 AccessLog에 한 줄 남긴다.

```ts
import { Audited, fromParam, fromCurrentUser } from '../audit/index.js';

@Audited('VIEW_EXPENSE_DETAIL', { resourceType: 'EXPENSE', resourceId: fromParam('expenseId') })
@Get('trips/:tripId/expenses/:expenseId')
detail() {}

// 라우트 하나에 하나만 붙인다(같은 메타데이터 키라 마지막 것만 남는다)
// 결제내역:  @Audited('LIST_EXPENSES', { resourceType: 'TRIP', resourceId: fromParam('tripId') })
// 정산 조회: @Audited('VIEW_SETTLEMENT', { resourceType: 'SETTLEMENT', resourceId: fromParam('tripId') })
// 탈퇴:      @Audited('DELETE_ACCOUNT', { resourceType: 'USER', resourceId: fromCurrentUser })
```

- 라우트 밖(서비스 트랜잭션 안, 잡)에서는 `AuditService.record({ userId, action, resourceType, resourceId, ip }, tx?)`.
- 숫자 요약이 필요하면 `details`(jsonb, 예: 파기 건수 `{ expenses, transactions, paymentMethods, detachedShared }`)를 넘긴다. 숫자만 넣는다. 서버 전용 행동은 `audit-actions.ts`에 있다: `PURGE_FINANCIAL_DATA`(결제수단 전부 해제·결제수단 0개일 때 공동 → 개인 삭제), `KAKAO_UNLINKED`(카카오 연결 끊기 알림).
- 행동은 shared `AccessAction`을 사용한다.
- 남기는 것: userId, action, resourceType, resourceId(UUID가 아니면 NULL), `ipHash`(HMAC-SHA256, `AUDIT_HMAC_KEY` 없으면 NULL), 시각. 금액·가맹점·닉네임·IP 원문은 남기지 않는다.
- requestId·user-agent는 테이블에 칸이 없어 같은 요청의 애플리케이션 로그 `접근 기록`(`accessLogId`, requestId 자동)으로 잇는다. 요청 로그 줄에 ip·userAgent가 있다.
- 기록 실패는 응답을 막지 않는다(오류 코드만 로그). 보존 1년은 파기 배치 9단계.

## env

| 이름                  | 필수         | 설명                                                         |
| --------------------- | ------------ | ------------------------------------------------------------ |
| `INTERNAL_JOB_SECRET` | 잡을 부를 때 | 32자 이상. 비우면 내부 잡 전부 403                           |
| `AUDIT_HMAC_KEY`      | 운영 필수    | 32자 이상. 접근 기록·동의 기록 IP 해시와 공동 결제 `sourceTxHash` 키. 운영(`NODE_ENV=production`)에서 없으면 부팅을 멈춘다. 로컬·테스트에서 없으면 `ipHash`·`sourceTxHash` NULL(운영은 Secret Manager `yeojeong-audit-hmac-key`) |
| `USER_REF_HMAC_KEY`   | 아니오       | 동의 이력이 없는 회원의 `userRefHash` 계산용(auth와 같은 키) |

## 테스트

- 단위: `retention-policy.spec.ts`(경계), `account-deletion.plan.spec.ts`(승계·익명화), `audit.*.spec.ts`, `common/internal-job/*.spec.ts`.
- e2e(실제 DB): `test/account.e2e-spec.ts`, `test/retention.e2e-spec.ts`, `test/audit.e2e-spec.ts`. `DATABASE_URL`이 없으면 건너뛴다. CI는 별도 테스트 DB를 사용한다. 파기 e2e는 그 DB에서 배치를 실제로 돌리므로 개발 DB 대신 별도 DB를 쓰는 것을 권한다.

## 통합 과제

- `membership.left` 타입은 S2A `src/trips/events.ts`를 그대로 쓴다. 그쪽 주석의 DELETED(그룹 삭제)에 탈퇴도 포함되도록 고치고, 스키마 통합 때 사유를 `ACCOUNT_DELETED`/`GROUP_DELETED`로 나눈다.
- 내부 잡: `@InternalJob()`이 전역 CSRF를 예외하고, Cloud Scheduler의 Google OIDC 토큰을 공통 가드가 검증한다. Worker는 경유하지 않는다.
- 로그 redact 목록(`common/logging/logger.ts`)에 `x-internal-job-secret`가 포함된다.
