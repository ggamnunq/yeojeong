# 그룹·여정·멤버십 (`src/trips`, `src/groups`) — S2A

여정 만들기부터 참여·강퇴·나가기·승계, 시작·종료, 자동 종료 잡, 1회성 이벤트까지 맡는다. 근거는 기능명세 2-3·2-5·3-1·3-4·4-7·4-8, FR-001·004, FR-201~209, FR-301~306, 6-3.

- `TripsModule`(`src/trips`)이 `GroupsModule`(`src/groups`)을 가져온다. `app.module.ts`에는 `TripsModule` 한 줄과 `EventEmitterModule.forRoot()`만 있다.
- 공유 타입·규칙 상수: `packages/shared/src/api/trips.ts` (`TripDetailResponse`, `TRIP_EDITABLE_FIELDS`, `TRIP_MEMBER_LIMIT` 등)
- DB 없이 판단하는 규칙은 `trip-rules.ts`에 모았다(단위 테스트 `trip-rules.spec.ts`).

## 엔드포인트

| 메서드 | 경로 | 권한·단계 | 응답 | 주요 에러 | FR |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/places?query=` | 로그인 | `Place[]`(최대 20) | — | 201 |
| POST | `/api/trips` | 로그인 | 201 `CreateTripResponse` | 400 `VALIDATION_FAILED` | 201 |
| GET | `/api/me/trips` | 로그인 | `MyTripsResponse` | — | 102·205 |
| GET | `/api/trips/:tripId` | 멤버 | `TripDetailResponse`(lastViewedTripId 갱신) | 404 | 001·301 |
| PATCH | `/api/trips/:tripId` | 그룹장 · 시작 전·진행 중 | `TripDetailResponse` | 400, 403 `NOT_LEADER`, 409 `TRIP_PHASE_INVALID`(`details.lockedFields`)·`VERSION_CONFLICT`(`details.current`) | 302 |
| POST | `/api/trips/:tripId/start` | 그룹장 · 시작 전 · `{ version }` | `TripDetailResponse` | 403, 409 | 303 |
| GET | `/api/trips/:tripId/end-preview` | 그룹장 · 진행 중 | `EndPreviewResponse` | 403, 409 | 304 |
| POST | `/api/trips/:tripId/end` | 그룹장 · 진행 중 · `{ version }` | `EndTripResponse` | 403, 409 | 304·306 |
| POST | `/api/trips/:tripId/events/ack` | 멤버 · `{ lastEventId }` | 204 | 404 | 004 |
| GET | `/api/groups/:groupId/members?includeLeft=` | 멤버 | `MemberSummary[]`(가입 순) | 404 | 206 |
| DELETE | `/api/groups/:groupId/members/:membershipId` | 그룹장 · 시작 전·진행 중 | 204 | 400 `CANNOT_KICK_SELF`, 403, 404, 409 | 207 |
| POST | `/api/groups/:groupId/leave` | 멤버 · 전 단계 | `LeaveGroupResponse` | 404 | 208 |
| DELETE | `/api/groups/:groupId` | 그룹장 · 시작 전 | 204 | 403, 409 | 209 |
| GET | `/api/invites/:code` | 로그인 · StrictThrottle | `InvitePreview` | 404 `INVITE_CODE_INVALID`, 403 `MEMBER_KICKED`, 409 `INVITE_TRIP_ENDED` | 203 |
| POST | `/api/invites/:code/join` | 로그인 · StrictThrottle | 201 `JoinTripResponse` | 위 + 409 `ALREADY_MEMBER`·`MEMBER_LIMIT_EXCEEDED` | 204 |
| POST | `/api/internal/jobs/auto-end` | 내부(Cloud Scheduler OIDC) | `AutoEndJobResponse` | 403 `FORBIDDEN` | 305 |

시작·종료·나가기는 행동이라 200, 만들기·참여는 201이다. 날짜는 KST 달력 날짜 `"2026-11-12"`, 시각은 `"2026-11-15T23:59:59+09:00"`.

## 규칙 메모(미결 항목은 추천안으로 구현)

| 항목 | 구현 |
| --- | --- |
| 기간(Q-29) | 종료일 ≥ 시작일, 최대 31일, 시작일은 오늘(KST) − 30일 이후. 수정 때 과거 시작일 규칙은 시작일을 바꿀 때만 |
| 통화 | 국가 → 통화(`places.ts` `COUNTRIES`). 표에 없는 국가는 400 `place.countryCode:unsupportedCountry`. 시작 전 국가를 바꿔 통화가 바뀌면 `FIXED` 환율 기준은 `SPOT_AT_PAYMENT`로 되돌린다 |
| 수정 범위(Q-14) | 시작 전 전 항목, 진행 중 그룹명·예산·종료일(오늘 이후), 종료 후 불가. 잠긴 항목도 지금 값과 같으면 받아 준다 |
| 시작(Q-26) | 종료일 23:59:59 KST가 지난 시작 전 여정은 409(`permissions.canStart = false`). 기간을 고쳐서 시작한다 |
| 초대코드 | CSPRNG 6자, 삭제되지 않은 그룹 안에서 유일(부분 유니크 인덱스). 충돌하면 5번까지 다시 뽑는다. 그룹이 삭제되면 같은 코드를 다시 쓸 수 있다. 종료 후 상세의 `inviteCode`는 null |
| 참여(Q-09·Q-16) | 승인 없음, 시작 전·진행 중만. 활성 20명 한도. 강퇴자는 재참여 불가(403 `MEMBER_KICKED`). 자진 이탈자는 같은 행을 되살려 이전 결제·부담 기록을 잇되, `joinOrder`는 재참여 시각 기준 맨 뒤(`max + 1`)로 다시 매기고 `joinedAt`도 갱신한다(Q-09 확정, 역할 MEMBER). 그래서 승계·멤버 목록 순서·이니셜 색은 새 가입 순서를 따른다. 새 멤버는 참여 전 1회성 이벤트를 보지 않는다 |
| 승계(4-7) | 그룹장이 나가면 활성 멤버 중 joinOrder 최소가 LEADER, 같은 트랜잭션에서 TripEvent `LEADER_CHANGED { newLeaderMembershipId, nickname }`(actor = 나간 그룹장). 나간 사람의 역할은 MEMBER로 내린다 |
| 마지막 멤버(Q-25) | 단계와 관계없이 그룹·여정 소프트 삭제(`deletedAt`). 파기는 30일 뒤 파기 배치 |
| 종료 미리보기(Q-10) | 그룹 전체 미확정 건수(취소 자식 제외), 숫자만 |
| 1회성 이벤트(FR-004) | `seq > lastSeenTripEventSeq`이고 actor가 내가 아닌 TripEvent를 최대 20개, ack는 더 큰 seq만 기록. 승계 토스트 닉네임은 응답 시점 값 |

## 동시성(기능명세 8-3)

상태를 바꾸는 모든 트랜잭션은 `trip-locks.ts`의 순서를 따른다.

1. `lockTrip`: Trip 행 `SELECT … FOR UPDATE`(그룹 1 : 여정 1이라 그룹 잠금을 겸한다). 삭제됐으면 404
2. 단계 재확인(`assertStatus`) → 요청자 활성 멤버·그룹장 재확인(`requireActiveMembership`) → `version` 비교
3. 변경 → `nextEventSeqs`로 이벤트 순서 번호 → 커밋 → 도메인 이벤트

잠금 순서는 항상 Trip 행 → Membership 행이다. 동시 참여는 잠금 뒤 `joinOrder = max + 1`, 그룹장 나가기와 다른 멤버 나가기·강퇴도 같은 잠금으로 줄을 서고, 활성 그룹장 부분 유니크 인덱스와 `UNIQUE(groupId, userId)`·`UNIQUE(groupId, joinOrder)`가 최종 방어다(P2002 → `ALREADY_MEMBER`). 자동 종료 잡이 여러 인스턴스에서 겹쳐도 여정마다 잠근 뒤 다시 확인해서 한 번만 끝내고 `trip.ended`도 한 번만 보낸다.

## 도메인 이벤트

타입은 `events.ts`. 다른 모듈은 `@OnEvent(TRIP_EVENTS.ENDED)`처럼 구독한다.

| 이벤트 | payload | 발행 시점 | 구독자(예정) |
| --- | --- | --- | --- |
| `trip.started` | `tripId, groupId, startedByUserId, startAt`(시작일 00:00 KST) + `eventSeq, occurredAt` | 시작 트랜잭션 커밋 뒤 | S2B 소급 인입(TRIP_START, [startAt, now]) |
| `trip.ended` | `tripId, groupId, endedByUserId`(자동이면 null)`, endedAt, reason`(`MANUAL`·`AUTO`)`, redelivered` + `eventSeq, occurredAt` | 종료 트랜잭션 커밋 뒤. 자동 종료 잡이 재전송할 때 `redelivered: true` | S2B 미확정 → 개인, S2C 정산 스냅샷 |
| `membership.joined` | `tripId, groupId, membershipId, userId, joinedAt, rejoined, tripStatus` + `eventSeq, occurredAt` | 참여 트랜잭션 커밋 뒤 | S2B 신규 멤버 소급 인입(진행 중일 때 JOIN) |
| `membership.left` | `tripId, groupId, membershipId, userId`(탈퇴 멤버면 null)`, reason`(`LEFT`·`KICKED`·`DELETED`) + `eventSeq, occurredAt` | 나가기·강퇴 커밋 뒤, 그룹 삭제는 활성 멤버마다 한 건 | S2B 이후 인입 중단 |
| `trip.auto-ending` | `tripId, groupId, autoEndAt`(순서 번호 없음) | 자동 종료 잡이 종료 트랜잭션 전에 보내고 최대 60초 기다림 | S2B FINAL 동기화(FR-305) |

보장과 구독자 규칙:

- **커밋 뒤에만 보낸다.** 롤백된 변경은 이벤트가 없다. 구독자는 발행자의 트랜잭션 밖에서 돈다.
- **`eventSeq`**: `trip_events.seq`와 같은 시퀀스에서 Trip 행을 잠근 뒤 받는다. 같은 여정 안에서는 커밋 순서대로 커진다. 여정이 다르면 비교하지 않는다. `trip_events.seq`에 빈 번호가 생기지만 seq는 순서 비교에만 쓴다. 타입은 `bigint`.
- **최소 1회 전달.** 구독자는 멱등이어야 하고, 같은 여정에서 이미 처리한 것보다 `eventSeq`가 작은 이벤트는 무시한다(재전송은 새 `eventSeq`로 온다).
- 발행자는 구독자를 차례로 기다린다(`emitAsync`). 구독자 예외는 `@OnEvent` 기본값(`suppressErrors: true`)으로 삼켜져 로그만 남고, 이미 커밋된 응답은 그대로 성공한다. 오래 걸리는 일(동기화)은 큐에 넣고 바로 돌아온다.
- 여정 만들기(그룹장 멤버십 생성)와 여정 정보 수정은 이벤트를 보내지 않는다.

### 종료 처리 순서

1. 종료 트랜잭션: Trip 행 `FOR UPDATE` → 진행 중·그룹장·version 재확인(자동이면 `status = ONGOING AND autoEndAt ≤ now` 재확인) → 미확정 건수 → `status = ENDED, endedAt, endedBy, endReason, version + 1` → `eventSeq` → 커밋
2. `trip.ended` 발행 → S2B가 미확정을 개인으로(AUTO_PERSONAL_ON_END), S2C가 정산 스냅샷을 만든다
3. 수동 종료 응답은 구독자를 기다린 뒤 `settlements.trip_id`로 `settlementId`를 읽어 넣는다(없으면 null)

결제를 바꾸는 트랜잭션이 기능명세 8-3대로 Trip 행을 `FOR SHARE`로 잠근 뒤 단계를 확인하면(I-6, S2B 몫) 1이 커밋된 순간부터 결제 변경이 막히므로, 2의 구독자가 보는 결제 집합은 종료 시점 그대로다. 1이 기다리는 동안 먼저 잡힌 결제 수정은 끝난 뒤 반영된 값으로 종료된다. 그래서 **구독자의 자동 개인 처리·정산 쓰기는 "ENDED면 변경 금지" 검사의 예외**로 두어야 한다. 기능명세 FR-306의 "한 트랜잭션"과 달리 1과 2가 나뉘므로, 2가 빠지는 경우(커밋 직후 프로세스 종료, 구독자 오류)는 자동 종료 잡이 메운다: 종료 5분~7일 사이인데 정산이 없거나 미확정이 남은 여정에 `trip.ended`를 `redelivered: true`로 다시 보낸다(1회 20건, `trip.ended` 구독자가 하나도 없으면 보내지 않음).

## 내부 잡

`POST /api/internal/jobs/auto-end`(Cloud Scheduler, 5분 주기).

- `@InternalJob()`: 운영은 Scheduler OIDC 서명·audience·서비스 계정을 공통 가드에서 검증한다. 로컬·테스트만 `x-internal-job-secret`를 쓴다.
- 전역 `CsrfGuard`가 먼저 돌아서 `Origin`도 `Sec-Fetch-Site: same-origin`도 없는 요청은 403 `CSRF_REJECTED`다. 공통 가드에서 `/api/internal/*`를 빼기 전까지 Scheduler는 `Sec-Fetch-Site: same-origin` 헤더를 함께 보낸다. 운영 origin lock(`x-origin-auth`)도 같은 문제라 공통 처리가 필요하다.
- 한 번에 50건, 남으면 다음 실행이 잇는다. 여정 하나가 실패해도 나머지는 계속한다.

## 테스트

| 파일 | 내용 |
| --- | --- |
| `src/trips/*.spec.ts` | 승계 순서, 단계별 수정 항목, 기간 규칙, 종료 조건, 셸·권한, 초대코드 생성, KST 날짜, 장소·통화, 이벤트 발행기, 상세 조립 |
| `test/trips-guards.e2e-spec.ts` | DB 없이: 비로그인 401, 비멤버 404, 비그룹장 403, 단계 위반 409, 검증 400, 초대코드 형식, 내부 잡 시크릿 |
| `test/trips-flow.e2e-spec.ts` | 실제 DB: 생성 → 목록 → 상세 → 참여 → 강퇴 → 나가기·승계 → 재참여 → 수정 → 시작 → 종료 → 잠금, 동시 참여, 그룹장·다음 멤버 동시 나가기, 인원 한도, 초대코드 충돌·재사용, 마지막 멤버, 자동 종료 겹침·재전송 |

실제 DB e2e는 `TEST_DATABASE_URL`이 있을 때만 돈다(CI는 건너뜀). 이름이 `_test`로 끝나는 전용 DB를 쓰고, 테스트가 매번 `TRUNCATE users, groups … CASCADE`로 비운다.

```bash
docker exec yeojeong-db-1 psql -U yeojeong -c "CREATE DATABASE yeojeong_s2a_test"
DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/yeojeong_s2a_test pnpm --filter @yeojeong/api exec prisma migrate deploy
TEST_DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/yeojeong_s2a_test pnpm --filter @yeojeong/api test:e2e
```
