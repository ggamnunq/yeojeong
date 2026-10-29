# DB 스키마와 마이그레이션

Prisma 7(`prisma.config.ts`)로 스키마를 관리한다. 마이그레이션 파일은 `prisma/migrations/`에 있고, 운영에는 배포 워크플로가 적용한다.

## 로컬에서 마이그레이션 만들기

```bash
pnpm db:up                                                    # 로컬 PostgreSQL
# schema.prisma를 고친 뒤
pnpm --filter @yeojeong/api db:migrate --name create_trips   # 생성 + 로컬 적용
pnpm --filter @yeojeong/api build                            # client 재생성(Prisma 7의 migrate dev는 generate를 하지 않는다)
```

- `migrate dev`는 임시 shadow DB를 만들어 기존 마이그레이션을 처음부터 다시 돌려 보고 차이를 계산한 뒤 지운다. 로컬 Docker 사용자는 superuser라 따로 설정할 것이 없다.
- 생성된 `migration.sql`을 읽어 보고 커밋한다. **한 번 적용된 마이그레이션 파일은 고치지 않는다.** 체크섬이 달라져 운영 배포가 멈춘다.
- SQL을 직접 써야 하면 `db:migrate --create-only --name ...`으로 빈 파일을 만들어 채운 뒤 `db:migrate`로 적용한다.
- 이름은 영어 snake_case로, 동사로 시작한다. 예: `create_trips`, `add_trips_currency`, `drop_users_legacy_name`.
- 로컬 DB를 처음부터 다시 만들려면 `pnpm --filter @yeojeong/api exec prisma migrate reset`(데이터가 지워진다).

| 명령 (`pnpm --filter @yeojeong/api ...`) | 설명                           |
| ---------------------------------------- | ------------------------------ |
| `db:migrate`                             | 마이그레이션 생성 + 로컬 적용  |
| `db:migrate:deploy`                      | 적용 안 된 마이그레이션만 적용 |
| `db:migrate:status`                      | 적용 상태 확인                 |
| `db:studio`                              | Prisma Studio                  |

Prisma CLI는 `DIRECT_URL`이 있으면 그것을, 없으면 `DATABASE_URL`을 쓴다. 로컬은 `DATABASE_URL`만 있으면 된다. 서버 런타임은 항상 `DATABASE_URL`을 쓴다.

CI는 여정 테스트의 TRUNCATE가 다른 테스트에 영향을 주지 않도록 Postgres DB 세 개(`DATABASE_URL` 일반 e2e, `TEST_DATABASE_URL` 여정, `PAYMENT_TEST_DATABASE_URL` 결제수단·인입)에 각각 마이그레이션을 적용한다. LeaveReason 확장과 기존 값 이관은 enum 추가가 커밋된 뒤 값을 사용할 수 있도록 별도 마이그레이션으로 나눈다.

## 스키마 규칙

- 모델은 PascalCase 단수, 테이블은 snake_case 복수: `@@map("trip_members")`
- 필드는 camelCase, 컬럼은 snake_case: `@map("kakao_id")`
- PK와 FK는 UUID다. 외부에 노출되는 ID는 순번을 쓰지 않는다([보안 원칙](../../../docs/security.md)).
  ```prisma
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ```
- 시각은 `@db.Timestamptz`. 모든 테이블에 아래 두 컬럼을 둔다. `updated_at`은 Prisma Client가 채우므로 SQL로 직접 고칠 때는 같이 바꾼다.
  ```prisma
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  ```
- 명세가 확정되지 않은 모델은 `///` 주석으로 표시한다.
- enum도 `@@map("snake_case")`로 DB 타입 이름을 맞춘다. 값은 `@yeojeong/shared`의 같은 이름 상수와 같다.
- 순서가 필요한 기록도 PK는 UUID로 두고, 순서용 컬럼(`trip_events.seq` BIGSERIAL)을 따로 둔다. 순서 번호는 응답에 내보내지 않는다.

## 도메인 모델

`20261028095249_create_domain`에서 기능명세 부록 A의 모든 모델을 만들었다. `20261028101853_add_consent_documents_is_draft`에서 `consent_documents.is_draft`를 추가하고 약관 초안(`0.1-draft`)을 넣었다(판정 규칙은 `apps/api/README.md` "동의 판정").

| 영역      | 모델 (테이블)                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 회원·인증 | `User`(users), `SignupTicket`(signup_tickets), `Session`(sessions), `ConsentDocument`(consent_documents), `UserConsent`(user_consents), `AccountDeletion`(account_deletions) |
| 그룹·여정 | `Group`(groups), `Trip`(trips), `Membership`(memberships), `TripEvent`(trip_events)                                                       |
| 결제수단  | `PaymentConnection`(payment_connections), `ConnectionAttempt`(connection_attempts), `PaymentMethod`(payment_methods), `Transaction`(transactions), `SyncRun`(sync_runs) |
| 장부      | `Expense`(expenses), `ExpenseShare`(expense_shares), `ExpenseChangeLog`(expense_change_logs)                                              |
| 환율·정산 | `ExchangeRate`(exchange_rates), `Settlement`(settlements), `SettlementMember`(settlement_members), `SettlementTransfer`(settlement_transfers) |
| 감사      | `AccessLog`(access_logs, User FK 없음)                                                                                                    |

금융 민감 컬럼: `*_enc`(bytea)에는 AES-256-GCM 암호문만 넣는다(키 `TOKEN_ENCRYPTION_KEY`, 추후 Cloud KMS). 카드·계좌는 마스킹 값(`masked_number`, `last4`)만 저장한다.

## DB 제약

Prisma 스키마로 표현할 수 없는 제약은 마이그레이션 SQL 끝에 직접 넣었다. Prisma는 CHECK와 부분 인덱스를 비교하지 않으므로 다음 `migrate dev`가 지우지 않는다(2026-10-28 확인). 서비스에서 이 제약 위반(P2002·P2004 등)을 만나면 도메인 코드로 바꿔 던진다.

| 제약                                   | 내용                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `memberships_active_leader_key`        | 부분 유니크: 그룹당 `role = LEADER AND left_at IS NULL`은 1행(I-2)                                   |
| `groups_invite_code_active_key`        | 부분 유니크: 삭제되지 않은 그룹의 초대코드                                                          |
| `groups_invite_code_check`             | 초대코드 `^[2-9A-HJKMNP-Z]{6}$`                                                                     |
| `trips_*_check`                        | 종료일 ≥ 시작일, 예산 1~10억, 국가·통화 코드 형식, FIXED면 고정 환율 필수, `status = ENDED` ⇔ `ended_at`·`end_reason` |
| `memberships_*_check`                  | `join_order ≥ 1`, `left_at`과 `leave_reason`은 함께, `kicked_by`는 KICKED일 때만                     |
| `payment_connections_active_token_check` | ACTIVE 연결은 `access_token_enc` 필수(해제·만료 시 토큰을 지울 수 있게 nullable)                   |
| `payment_methods_*_check`              | `masked_number`에 `*` 포함, `last4`는 숫자 2~4자리                                                  |
| `expenses_*_check`                     | 부모(환불 자식이 아닌 행)만 `net_krw_amount` NOT NULL·≥ 0, 통화 형식                               |
| `expense_shares`, `exchange_rates`, `settlements`, `settlement_transfers` | 금액·환율 ≥ 0 또는 > 0, 송금 권장안 from ≠ to |
| `user_consents_active_key`             | 부분 유니크: `(user_id, consent_id, version) WHERE agreed AND withdrawn_at IS NULL`. 철회된 동의와 같은 버전으로 다시 동의하면 새 행을 쌓는다(기능명세 4-10 v0.5.7). 유효 판정은 버전별 최신 행(`common/auth/consent-checker.ts`) |
| `expenses_source_tx_hash_check`        | `source_tx_hash`는 hex 64자(HMAC). 결제수단 전부 해제 뒤 재인입 방지 키 |
| `transactions_source_check`            | `source = PROVIDER`면 `payment_method_id`·`external_ref` 필수, `source = MANUAL`(지갑 직접 입력, S7)이면 `payment_method_id`·`raw_payload_enc`가 NULL. 유니크 `(payment_method_id, external_ref)`는 NULL끼리 겹치지 않아 MANUAL 행에 걸리지 않는다 |
| `user_consents_*_check`, `consent_documents_*_check`, `account_deletions_channel_check` | screen·method·withdraw_channel·change_type·channel 허용 값, doc_hash·ip_hash 형식 |
| `access_logs_client_ip_admin_only_check` | 원 IP(`client_ip`)는 관리자 접근 기록(`action LIKE 'ADMIN\_%'`)에만. 일반 사용자 행은 `ip_hash`만(마이그레이션 `20261030010002`) |

## 배포 흐름

`main`에 API 변경이 push되면 `.github/workflows/deploy-api.yml`이 순서대로 실행한다.

1. 이미지 빌드, Artifact Registry에 push
2. Secret Manager에서 `yeojeong-direct-url`을 읽는다. 배포 서비스 계정은 이 시크릿 하나만 읽을 수 있다.
3. `prisma migrate deploy` → `prisma migrate status` (`scripts/prisma-prod.sh`)
4. Cloud Run에 새 리비전 배포

3이 실패하면 4로 넘어가지 않는다. PR에서는 운영 DB에 붙지 않는다(Workload Identity가 `main`만 허용).

## 하위 호환 규칙 (expand → 코드 배포 → contract)

마이그레이션이 먼저 적용되고 새 리비전이 뜨기까지, 그리고 배포가 실패하면 그 뒤로도 **옛 코드가 새 스키마 위에서 돈다.** 그래서 한 번의 배포에 들어가는 마이그레이션은 옛 코드를 깨지 않아야 한다.

- 바로 해도 되는 것: 테이블 추가, nullable 컬럼 추가, 기본값이 있는 컬럼 추가, 인덱스 추가
- 나눠서 해야 하는 것: 컬럼·테이블 삭제, 이름 변경, 타입 변경, `NOT NULL` 추가
  1. expand: 새 컬럼을 추가한다(필요하면 기존 데이터 복사).
  2. 코드 배포: 새 컬럼을 읽고 쓰는 코드를 배포한다.
  3. contract: 다음 배포에서 옛 컬럼을 지우거나 제약을 건다.

### 동의 기록 IP: 평문 → HMAC (완료)

`user_consents.ip`(inet 평문)를 `ip_hash`(HMAC-SHA256, 키 `AUDIT_HMAC_KEY` = Secret Manager `yeojeong-audit-hmac-key`, 접근 기록과 같은 키)로 옮겼다.

1. expand (`20261029000003_consent_ip_hash_expand`, #33): `ip_hash` 추가, `ip`의 `NOT NULL` 해제. 새 코드는 `ip_hash`만 썼다.
2. 이관: 내부 잡 `consent-ip-backfill`과 파기 배치 `CONSENT_IP_PLAINTEXT` 단계가 평문을 해시로 옮기고 지웠다.
3. 확인: 운영 파기 배치 수동 실행에서 `CONSENT_IP_PLAINTEXT` count = 0, hasMore = false.
4. contract (`20261029010003_drop_user_consents_ip`, S4): `ip` 컬럼 DROP. 이관 잡·파기 단계·shared `ConsentIpBackfillResult`·`PurgeStep.CONSENT_IP_PLAINTEXT`도 함께 지웠다(Cloud Scheduler에는 이 잡이 없었다).
   - 하위 호환: 마이그레이션 적용 뒤 잠시 트래픽을 받는 옛 리비전(#33)의 요청 경로는 `ip`를 읽거나 쓰지 않는다(2026-10-29 로컬 쿼리 로그로 확인 — `createMany`는 넘긴 컬럼만 INSERT, 나머지는 `select` 지정·`updateMany`·`count`·`deleteMany`). `ip`를 쓰는 것은 옛 리비전의 이관 잡(수동)과 파기 배치 `CONSENT_IP_PLAINTEXT` 단계(04:00 KST)뿐이라, 그 창에 파기 배치가 옛 리비전에서 돌면 그 단계에서 500으로 끝나고 Scheduler 재시도가 새 리비전에서 다시 돈다.

## 롤백

Prisma에는 down 마이그레이션이 없다. 되돌릴 때는 되돌리는 마이그레이션을 새로 만들어 배포한다(forward-fix).

- 코드만 문제라면 Cloud Run 이전 리비전으로 트래픽을 돌린다. 하위 호환 규칙을 지켰다면 옛 코드는 새 스키마에서도 돈다.
  ```bash
  gcloud run services update-traffic yeojeong-api --region asia-northeast3 --to-revisions <리비전>=100
  ```
- 마이그레이션이 실패하면 `_prisma_migrations`에 실패로 기록되고 이후 `migrate deploy`가 P3009로 멈춘다. DB 상태를 확인한 뒤 둘 중 하나로 기록을 정리한다.
  - 반영되지 않았다면: `migrate resolve --rolled-back <마이그레이션 이름>` → SQL을 고쳐 다시 배포
  - 손으로 마저 반영했다면: `migrate resolve --applied <마이그레이션 이름>`

## Supabase 주의

- **연결**: 런타임은 트랜잭션 풀러(6543), 마이그레이션은 세션 풀러(5432)를 쓴다. 트랜잭션 풀러에서는 세션 단위 기능이 안 돼 `migrate`가 동작하지 않는다. 직접 호스트 `db.<ref>.supabase.co`는 IPv6 전용이라 GitHub 러너와 Cloud Run에서 붙지 못한다.
- **TLS**: Prisma CLI(스키마 엔진)는 libpq식 `sslmode=verify-full`·`sslrootcert`를 무시한다. 틀린 CA를 줘도 그냥 붙는다. 인증서 검증은 `sslcert=<CA 파일>&sslaccept=strict`를 줘야 켜진다.
  - 2026-10-28 Linux(OpenSSL 3)에서 확인한 결과: 맞는 CA는 성공, 틀린 CA나 CA 없음은 `certificate verify failed`, 호스트 이름 대신 IP로 붙으면 `IP address mismatch`
  - macOS에서는 맞는 CA로도 실패한다. Supabase 풀러 인증서에 EKU가 없고 유효기간이 5년이라 Apple TLS 정책에 걸린다.
  - 그래서 시크릿 `yeojeong-direct-url`은 표준 URL(`sslmode=require`) 그대로 두고, `scripts/prisma-prod.sh`가 쿼리 문자열을 버린 뒤 `sslmode=require&sslcert=<레포>/infra/envs/prod/certs/supabase-prod-ca-2021.crt&sslaccept=strict`를 붙인다. CA 경로는 체크아웃 위치마다 달라 시크릿에 넣지 않았고, 상대 경로는 실행 위치 기준이라 스크립트가 절대 경로로 계산한다. macOS에서는 같은 스크립트가 Linux 컨테이너 안에서 다시 돈다.
- **권한 잠금** (`20261028083600_supabase_lockdown`): Supabase는 `public` 스키마를 `anon`·`authenticated`(Data API용 역할)에 열어 둔다. Data API는 꺼 두었지만 2중 방어로 이 두 역할의 스키마 USAGE, 테이블·시퀀스·함수 권한, `postgres` 역할의 기본 권한을 거뒀다. `PUBLIC`에 열린 스키마 USAGE도 닫았다. 로컬처럼 `anon` 역할이 없는 DB에서는 아무것도 하지 않는다.
  - `supabase_admin`의 기본 권한은 `postgres`가 바꿀 수 없어 그대로 남아 있다. 스키마 USAGE가 막혀 있어 그 역할이 만든 객체에도 닿지 못한다.
  - 확인 쿼리(모두 `f`, 0행이어야 한다):
    ```sql
    select has_schema_privilege('anon', 'public', 'USAGE'), has_schema_privilege('authenticated', 'public', 'USAGE');
    select * from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated');
    ```

## 운영에서 직접 실행하기

평소에는 배포 워크플로에 맡긴다. 상태 확인이나 `migrate resolve`가 필요할 때만 쓴다.

```bash
gcloud auth login   # 프로젝트 권한이 있는 계정
apps/api/scripts/prisma-prod.sh migrate status
apps/api/scripts/prisma-prod.sh migrate resolve --rolled-back <마이그레이션 이름>
```

- 시크릿은 gcloud로 읽어 환경변수로만 넘긴다. 값을 출력하거나 파일·셸 기록에 남기지 않는다.
- `migrate deploy|status|resolve|diff`만 허용한다. `migrate reset`, `db push` 같은 명령은 스크립트가 막는다.
- macOS에서는 Docker가 필요하다(첫 실행은 설치 때문에 1~2분 걸린다).

## 도메인 테이블을 추가할 때

1. `schema.prisma`에 모델을 추가한다(위 스키마 규칙).
2. `pnpm --filter @yeojeong/api db:migrate --name create_<테이블>`로 마이그레이션을 만들고 SQL을 읽는다. 하위 호환인지 확인한다.
3. `pnpm build && pnpm lint && pnpm test` 후 PR을 올린다.
4. 머지하면 Deploy API가 운영에 적용하고 배포한다. 새 테이블은 기본 권한 덕분에 `anon`·`authenticated`에 열리지 않는다.
