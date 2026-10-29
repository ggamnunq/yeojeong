# 운영자의 개인정보 접근 절차

개인정보처리방침 제2조 5번 표·제3조(운영자의 개인정보 처리 기록 1년 이상)와 「개인정보의 안전성 확보조치 기준」의 접속기록 보관·점검을 지키기 위한 운영 절차입니다. 개인정보취급자는 운영자 본인 한 명입니다.

## 1. 원칙

1. **회원 개인정보는 관리자 페이지로만 다룹니다.** 문의 처리, 권리 행사(열람·정정·삭제) 요청 처리, 이메일 탈퇴 요청 처리 모두 관리자 페이지에서 합니다. 관리자 페이지의 모든 열람·조치는 접근 기록(`access_logs`, `ADMIN_*`)으로 남습니다.
2. **운영 DB 직접 접속은 불가피할 때만**(장애 조사, 관리자 페이지로 할 수 없는 데이터 복구 등) 아래 스크립트로 합니다. Supabase 대시보드의 SQL Editor·Table Editor로 회원 데이터를 보지 않습니다.
3. 직접 접속에서도 필요한 행·칸만 조회하고, 조회 결과를 파일·메신저·스크린샷으로 옮기지 않습니다.

## 2. DB 직접 접속: `scripts/ops/db-connect.sh`

```bash
# gcloud에 운영자 계정으로 로그인돼 있어야 한다(gcloud auth login). psql은 brew install libpq
scripts/ops/db-connect.sh --reason "결제 동기화 장애 조사(#123)"
# 또는 pnpm ops:db-connect -- --reason "..."
# 사유를 빼면 물어본다. 비어 있으면 접속하지 않는다.
# 한 줄 쿼리: scripts/ops/db-connect.sh --reason "..." -- -c 'select count(*) from users'
```

스크립트가 하는 일:

| 단계 | 내용 |
|---|---|
| 사유 | 필수, 한 줄, 200자 이하. **사유에 회원 개인정보(닉네임·ID 등)를 적지 않습니다** — 이슈 번호나 작업 이름으로 적습니다. 비어 있으면 아무것도 하지 않고 멈춥니다 |
| 운영자 식별 | `gcloud auth print-access-token`의 토큰을 Google tokeninfo로 확인한 **실제 토큰 주체의 이메일**(`email_verified = true`만). `gcloud config`의 account 값은 쓰지 않습니다. 토큰은 표준입력으로만 보내고 남기지 않습니다 |
| 연결 정보 | 같은 자격 증명으로 Secret Manager `yeojeong-direct-url`(세션 풀러)을 읽습니다. 값은 셸 변수에만 두고 화면·셸 히스토리·프로세스 인자·환경변수에 남기지 않습니다. psql에는 0700 임시 폴더의 0600 비밀번호 파일(`PGPASSFILE`)로 넘기고, 기록용 접속은 끝나는 즉시, 세션용은 접속 후 20초 안에 지웁니다(그 뒤 `\c` 재접속은 비밀번호를 묻습니다). psql의 `\!` 하위 셸에는 비밀번호가 물려지지 않습니다 |
| 시작 기록 | `access_logs`에 `OPERATOR_DB_ACCESS_START` — 운영자(토큰 주체 이메일)·사유·호스트 이름·시작 시각. 기록을 못 남기면 접속하지 않습니다 |
| 세션 | psql, TLS `verify-full`(레포의 Supabase CA). `PSQL_HISTORY=/dev/null`이라 입력한 쿼리를 `~/.psql_history`에 남기지 않습니다. `application_name = yeojeong-operator:<세션 ID>`. 세션 안의 Ctrl-C는 쿼리 취소이고 스크립트를 끝내지 않습니다 |
| 종료 기록 | 정상 종료(`\q`)·오류·창 닫힘(SIGHUP)·SIGTERM 모두 EXIT trap 한 곳에서 `OPERATOR_DB_ACCESS_END` — 접속 시간(초)·종료 코드(= psql 종료 코드). START와 END는 같은 `request_id`(`opdb:<세션 ID>`)로 이어집니다 |

**접속지 정보**: 스크립트는 외부 IP 조회 서비스를 부르지 않는다. DB 직접 접속의 접속지 기준은 **GCP 감사 로그의 `callerIp`**(같은 접속에서 한 Secret Manager `yeojeong-direct-url` 읽기, 400일)다 — `access_logs`의 `host`(호스트 이름)·세션 시각과 함께 4절 3번 쿼리로 대조한다. (관리자 페이지 접근 기록은 원 IP를 `access_logs.client_ip`에 1년 남긴다.)

운영자 식별·시크릿 읽기·비밀번호 파일·접근 기록 INSERT는 `scripts/ops/lib/operator-db.sh`에 있고 4절의 `access-review.sh`도 같이 씁니다.

기록 형식(`access_logs`): `user_id` = `md5('operator:' + 이메일)`로 만든 UUID(회원 행 없음), `action` = `OPERATOR_DB_ACCESS_START`·`END`, `resource_type` = `DATABASE`, `ua` = `scripts/ops/db-connect.sh`, `details` = `{ operator, reason, host, at }`(+ END는 `durationSec`, `exitStatus`). 다른 접근 기록과 같이 **1년 보관 후 파기 배치(`ACCESS_LOGS`)**가 지웁니다.

`SIGKILL`이나 전원 차단처럼 trap이 돌 수 없는 종료로 END가 빠지면, 다음 접속 때 같은 세션 ID로 아래처럼 수동 기록을 남기고 월간 점검 메모에 적습니다.

```sql
INSERT INTO access_logs (user_id, action, resource_type, request_id, ua, details)
VALUES (md5('operator:' || lower('<이메일>'))::uuid, 'OPERATOR_DB_ACCESS_END', 'DATABASE', 'opdb:<세션 ID>',
        'manual', jsonb_build_object('operator', '<이메일>', 'reason', '종료 기록 누락 보정', 'at', now()));
```

스크립트 테스트(가짜 gcloud·tokeninfo + 로컬 임시 DB): `TEST_DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/<이름>_test bash scripts/ops/db-connect.test.sh` — 사유 없음·빈 사유·여러 줄 사유에서 gcloud를 부르기 전에 멈추는지, 운영자가 설정 계정이 아니라 토큰 주체인지, 미확인 이메일이면 시크릿을 읽기 전에 멈추는지, START·END 기록, 비정상 종료·SIGTERM에도 END가 남는지, 세션 중 SIGINT가 종료로 기록되지 않는지, 하위 셸에 `PGPASSWORD`가 없고 비밀번호 파일이 지워지는지 봅니다.

### 한계와 후속 과제

- `access_logs`의 접속 기록은 스크립트가 운영 DB 계정(`postgres`)으로 직접 쓰므로, 같은 권한이면 기록을 고치거나 지울 수 있습니다. 그래서 **기준 기록은 GCP 감사 로그**(시크릿 읽기, 운영자가 지울 수 없는 `_Required`·잠긴 감사 버킷)이고 `access_logs`는 사유·세션 시간을 보태는 보조 기록입니다.
- 스크립트를 거치지 않고 시크릿을 읽어 접속하는 것도 기술적으로는 가능합니다. 이 경우에도 시크릿 읽기는 감사 로그에 남으므로 월간 점검(4절)의 대조로 찾아냅니다.
- **후속 과제**: 운영자 전용 DB 역할 — `access_logs` INSERT만 허용하고 UPDATE·DELETE·TRUNCATE는 막은 역할(그리고 업무용 조회 권한을 최소로 나눈 역할)로 스크립트가 접속하게 바꾸기. 파기 배치(1년 지난 행 삭제)는 서버 역할이 맡는다.

## 3. 보관 기간

| 기록 | 위치 | 보관 |
|---|---|---|
| 관리자 페이지 접근 기록(`ADMIN_*`), DB 직접 접속 기록(`OPERATOR_DB_ACCESS_*`), 월간 점검 기록(`OPERATOR_ACCESS_REVIEW`) | DB `access_logs` | 1년(파기 배치) |
| GCP 감사 로그(Admin Activity, Secret Manager·Cloud Run·IAM·Cloud Storage 등 Data Access) — **기준 기록** | Cloud Logging `_Required`(400일) · 서울 감사 버킷 `yeojeong-audit-logs`(400일, `infra/envs/prod/logging.tf`) | 400일 |

## 4. 월 1회 접속 기록 점검

**매월 첫 주**에 지난 점검 이후의 기록을 보고, 결과를 `access_logs`에 남깁니다. 아래 1·2(DB 기록)는 스크립트가 요약하고, 3(GCP 감사 로그 — 기준 기록)은 스크립트가 출력하는 명령으로 직접 대조합니다.

```bash
scripts/ops/access-review.sh                    # 또는 pnpm ops:access-review
# 요약을 보여 준 뒤 묻는다: 1) 이상 없음  2) 이상 있음 → 메모(한 줄, 500자 이하, 개인정보 없이. 이상 있음이면 필수)
scripts/ops/access-review.sh --since 2026-10-01 # 점검 기간 시작(KST 날짜)을 직접 정할 때
scripts/ops/access-review.sh --result ok --note "GCP 감사 로그 대조 완료"   # 묻지 않고 기록
```

| 단계 | 내용 |
|---|---|
| 접속 | `db-connect.sh`와 같다 — 점검자 = gcloud 액세스 토큰의 실제 주체(tokeninfo 이메일), 연결 정보는 Secret Manager `yeojeong-direct-url`, 값은 화면·인자·환경변수에 남기지 않음. 이 점검도 DB 직접 접속이므로 `OPERATOR_DB_ACCESS_START`(사유 "월간 접속기록 점검")·`END`를 남깁니다 — 감사 로그의 시크릿 읽기와 짝이 맞습니다 |
| 점검 기간 | 지난 점검 기록(`OPERATOR_ACCESS_REVIEW`)의 `periodEnd`부터 이번 접속 시작까지. 기록이 없으면 지난달 1일 0시(KST)부터. 점검 세션 자신은 다음 점검 기간에 들어갑니다. 결과를 남기지 않은 실행은 기간을 옮기지 않습니다 |
| 요약(KST) | 관리자 접근 기록(`ADMIN_*`) 행위·`client_ip`별 건수와 **처음 보는 IP** 표시 · 관리자 로그인 실패 `client_ip`·사유별 · DB 직접 접속 START·END 짝(**END 없음 / START 없음** 표시)과 사유·호스트·시각 · 최근 점검 기록 3건 · 점검 기간을 채운 GCP 감사 로그 대조 명령 |
| 기록 | `access_logs` 한 행: `action` = `OPERATOR_ACCESS_REVIEW`, `resource_type` = `DATABASE`, `request_id` = 점검 세션(`opdb:<세션 ID>`, START·END와 같음), `ua` = `scripts/ops/access-review.sh`, `details` = `{ operator, host, periodStart, periodEnd, result: OK \| ISSUE, note, summary: { adminEvents, adminLoginFailed, adminClientIps, dbSessions, dbStartWithoutEnd, dbEndWithoutStart }, at }`. 메모 등 값은 psql 변수로만 넣습니다(SQL 인젝션 방지). 결과를 받지 못하면(대화형이 아니고 `--result`도 없음) 기록하지 않고 종료 코드 3 |

스크립트 테스트(가짜 gcloud·tokeninfo + 로컬 임시 DB, `access_logs`의 `ADMIN_*`·`OPERATOR_*` 행을 지우고 씀): `TEST_DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/<이름>_test bash scripts/ops/access-review.test.sh` — 잘못된 결과·메모·기간 인자에서 gcloud를 부르기 전에 멈추는지, 요약(client_ip별·실패 사유별·처음 보는 IP·짝 없는 START/END·기간 밖 제외), 점검 기록(점검자 = 토큰 주체, 메모의 따옴표 그대로), 점검 세션의 START → 점검 → END, 다음 점검 기간이 지난 `periodEnd`에서 이어지는지를 봅니다.

점검 항목(1·2의 SQL은 스크립트 없이 지난달을 직접 볼 때 쓴다):

1. DB 직접 접속: START마다 END가 있는지, 사유가 구체적인지, 근무 외 시간·낯선 호스트가 없는지.

   ```sql
   SELECT s.request_id, s.details->>'operator' AS operator, s.details->>'reason' AS reason, s.details->>'host' AS host,
          s.at AS started_at, e.at AS ended_at, e.details->>'exitStatus' AS exit_status
   FROM access_logs s
   LEFT JOIN access_logs e ON e.request_id = s.request_id AND e.action = 'OPERATOR_DB_ACCESS_END'
   WHERE s.action = 'OPERATOR_DB_ACCESS_START'
     AND s.at >= date_trunc('month', now()) - interval '1 month' AND s.at < date_trunc('month', now())
   ORDER BY s.at;
   ```

2. 관리자 페이지: `ADMIN_LOGIN_FAILED` 급증(원 IP `client_ip`별), 낯선 `client_ip`의 `ADMIN_LOGIN`, 업무와 맞지 않는 `ADMIN_VIEW_USER`·`ADMIN_WITHDRAW_USER`가 없는지.

   ```sql
   SELECT action, client_ip, count(*), min(at), max(at)
   FROM access_logs
   WHERE action LIKE 'ADMIN\_%' AND at >= date_trunc('month', now()) - interval '1 month' AND at < date_trunc('month', now())
   GROUP BY action, client_ip ORDER BY action, count(*) DESC;
   ```
3. GCP 감사 로그(**기준 기록**): DB 비밀번호를 얻을 수 있는 읽기를 모두 대조합니다. 사람 계정의 읽기마다 위 1의 START(`db-connect.sh`·`access-review.sh`)가 비슷한 시각에 있어야 하고, 서비스 계정의 읽기는 정해진 것(아래)만 있어야 합니다.
   - **callerIp 대조**: 사람 계정 읽기의 `protoPayload.requestMetadata.callerIp`가 운영자가 아는 접속지(집·사무실 회선, 그날 쓴 네트워크)인지 확인하고, 같은 시각 START의 `host`(호스트 이름)와 함께 봅니다. 관리자 페이지 `client_ip`(위 2)와 같은 회선이면 같은 IP로 보입니다. 모르는 IP·START 없는 읽기는 "이상 있음"으로 기록하고 메모에 이슈 번호를 적습니다
   - `access-review.sh`가 점검 기간(`timestamp>=` · `<`)을 채운 명령을 출력합니다. 기간을 직접 볼 때는 아래처럼 `--freshness`로 봅니다
   - Secret Manager `yeojeong-direct-url`(세션 풀러) — 사람: `db-connect.sh`·`access-review.sh` 접속, 배포 서비스 계정: 마이그레이션
   - Secret Manager `yeojeong-database-url`(런타임 연결) — Cloud Run 런타임 서비스 계정(인스턴스 시작)만. 사람의 읽기는 없어야 합니다
   - Terraform state 버킷(`yeojeong-11fb29-tfstate`, state에 DB 비밀번호가 있음) 객체 읽기 — `terraform plan/apply`를 한 날과 맞는지

   ```bash
   gcloud logging read 'protoPayload.methodName="google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion"
     AND (protoPayload.resourceName:"secrets/yeojeong-direct-url" OR protoPayload.resourceName:"secrets/yeojeong-database-url")' \
     --freshness=35d --project yeojeong-11fb29 \
     --format='table(timestamp, protoPayload.resourceName, protoPayload.authenticationInfo.principalEmail, protoPayload.requestMetadata.callerIp)'
   gcloud logging read 'protoPayload.serviceName="storage.googleapis.com" AND protoPayload.methodName="storage.objects.get"
     AND resource.labels.bucket_name="yeojeong-11fb29-tfstate"' --freshness=35d --project yeojeong-11fb29 \
     --format='table(timestamp, protoPayload.authenticationInfo.principalEmail, protoPayload.requestMetadata.callerIp)'
   ```

4. 이상이 있으면 원인을 확인하고, 필요하면 비밀번호 교체(Terraform `random_password.db` 재생성)와 처리방침 제9조(유출 통지) 절차를 검토합니다. 조치가 끝나면 다음 점검 메모에 결과를 적습니다.
