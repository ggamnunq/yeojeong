# expenses — 여정 장부(결제)

기능명세 3-2·4-2·4-3, FR-406~408(사용자 조작)·501~512, 6-3 "결제". 응답 타입은 `@yeojeong/shared`의 `api.ts`(ExpenseListItem·ExpenseDetail)와 `api/expenses.ts`(넓힌 응답·요청).

## 엔드포인트

| 메서드 | 경로 | 단계 | 권한 | 응답 |
| --- | --- | --- | --- | --- |
| GET | `/api/trips/:tripId/expenses?cursor&limit&status&day&order` | 진행 중·종료 | 멤버 | `ExpenseListResponse` |
| GET | `/api/trips/:tripId/expenses/:expenseId` | 진행 중·종료 | 멤버 + 가시성 | `ExpenseDetailResponse` |
| PUT | `/api/trips/:tripId/expenses/:expenseId/classification` | 진행 중 | 결제자 | `ExpenseDetailResponse` |
| POST | `/api/trips/:tripId/expenses/:expenseId/duplicate-dismissal` | 진행 중 | 결제자 | `ExpenseDetailResponse` (200) |
| GET | `/api/trips/:tripId/out-of-period-candidates?side=BEFORE\|AFTER` | 진행 중 | 본인 거래 | `OutOfPeriodCandidate[]` |
| POST | `/api/trips/:tripId/out-of-period-expenses` | 진행 중 | 본인 거래 | 201 `AddOutOfPeriodExpensesResponse` |

## 규칙

- **가시성(I-8)**: 모든 조회에 `visibleExpenseWhere(me)` = `refundOfExpenseId IS NULL AND (status = SHARED OR payer = me)`와 `tripId`를 함께 건다. 남의 미확정·개인·취소 자식·다른 여정 결제는 상세도 404.
- **종료 후 미확정**: `trip.ended` 리스너가 PENDING → PERSONAL(멱등). 리스너가 실패해도 조회 시점에 남은 PENDING을 다시 전환하고(실패해도 조회는 계속), 응답은 종료 여정의 PENDING을 PERSONAL로 내보낸다(`effectiveStatus`). `personalizePendingExpenses(tx, tripId)`는 S2A가 종료 트랜잭션 안에서 직접 불러도 된다.
- **분류**: 전이·로그 action은 `CLASSIFICATION_TRANSITIONS`. 같은 상태·같은 부담 인원이면 변경 없이 200(version 무관). 공동 → 개인은 `confirmSharedToPersonal: true` 필요(없으면 409 `SHARED_TO_PERSONAL_CONFIRM_REQUIRED`). 부담 인원을 생략하면 미확정·개인 → 공동은 활성 멤버 전원, 공동 → 공동은 그대로.
- **부담 인원**: 활성 멤버 + 지금 부담 인원에 있는 나간 멤버(해제만). 그 밖은 400 `PARTICIPANT_NOT_MEMBER`(`details.invalidMembershipIds`). `splitEvenly`로 1인 = floor, 나머지는 결제자(없으면 가입 순 첫 사람). 결제자 혼자 선택은 서버가 막지 않는다(Q-08은 화면에서).
- **변경됨**: SHARED가 된 뒤의 부담 인원 변경·공동 → 개인, 그리고 예전에 공개됐던 개인 → 공동. 결제자에게는 `flags.changed = false`.
- **잠금·동시성(8-3)**: 변경은 한 트랜잭션에서 Trip `FOR SHARE` → 여정 advisory lock → 그룹 멤버 `FOR SHARE` → Expense `FOR UPDATE` 순으로 잡고 단계(409 `EXPENSE_LOCKED`)·멤버십(404)·가시성(404)·결제자 나감(409 `EXPENSE_LOCKED`)·결제자(403 `NOT_PAYER`)·version(409 `VERSION_CONFLICT`, `details.current`)을 다시 확인한다.
- **중복 의심**: 공동이 될 때 `flagDuplicates`가 판정(다른 결제자·같은 가맹점 키·원통화 금액·±120초). 공동 → 개인이면 묶음에서 빠지고 1건만 남으면 해제. 표시 해제는 묶음 전체에 `duplicateDismissedAt`을 남기고 groupId는 유지해 같은 쌍을 다시 묶지 않는다. 인입(S2B-1)이 공동 결제의 순액을 바꾸면 `flagDuplicates`를 다시 부른다.
- **기간 외 추가**: 저장된 본인 Transaction만 본다(APPROVAL, 동일 사용자 중복·해제된 결제수단·이 여정에 있는 거래·전액 취소 제외). 하나라도 안 되면 400 `OUT_OF_PERIOD_CANDIDATE_INVALID`(`details.invalidCandidateIds`)로 아무것도 넣지 않는다. 부분 취소는 취소 자식으로 붙인다. 원화는 `krw.ts`(fx 모듈이 생기면 교체), 환율이 없으면 503 `FX_RATE_UNAVAILABLE`.
- 접근 기록은 S2D `@Audited`(목록 LIST_EXPENSES·상세 VIEW_EXPENSE_DETAIL·후보 VIEW_CANDIDATES·분류 CLASSIFY_EXPENSE, ID만).

## 다른 모듈이 쓰는 것

- `ExpenseStatsService.personalCountsByPayer(tripId, tx?)` — 결제자별 개인 결제 건수(SettlementMember.personalCount).
- `ExpenseQueryService.paymentsByPayer(tripId, viewer, payer)` — 정산 멤버별 내역(FR-703): 공동 목록, 개인 건수, 본인이면 개인 목록.
- `personalizePendingExpenses(tx, tripId)` — 종료 처리(이벤트 계약은 `src/trips/events.ts`의 `TRIP_EVENTS.ENDED`·`TripEndedEvent`).
- 리스너는 AppModule의 `EventEmitterModule.forRoot()`(S2A)로 돈다. S2A는 종료 트랜잭션에서 미확정을 바꾸지 않고 이 리스너에 맡기며, 남아 있으면 자동 종료 잡이 `redelivered: true`로 다시 보낸다.

## 테스트

- 단위: `expense-rules.spec.ts`(가시성·권한·전이표·분담), `expense-view.spec.ts`(응답 조립), `helpers.spec.ts`(KST·커서·중복·원화).
- e2e: `test/expenses.e2e-spec.ts` — 실제 DB(`pnpm db:up` + `db:migrate:deploy`). DB에 접속할 수 없으면(CI) 건너뛴다. 만든 행만 지운다.
