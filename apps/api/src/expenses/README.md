# expenses — 여정 장부(결제)

기능명세 3-2·4-2·4-3, FR-406~408(사용자 조작)·501~512, 6-3 "결제". 응답 타입은 `@yeojeong/shared`의 `api.ts`(ExpenseListItem·ExpenseDetail)와 `api/expenses.ts`(넓힌 응답·요청).

## 엔드포인트

| 메서드 | 경로 | 단계 | 권한 | 응답 |
| --- | --- | --- | --- | --- |
| GET | `/api/trips/:tripId/expenses?cursor&limit&status&day&order` | 전 단계(예정은 직접 입력만 있다) | 멤버 | `ExpenseListResponse` |
| GET | `/api/trips/:tripId/expenses/:expenseId` | 전 단계 | 멤버 + 가시성 | `ExpenseDetailResponse` |
| PUT | `/api/trips/:tripId/expenses/:expenseId/classification` | 진행 중(직접 입력은 예정도) | 결제자(직접 입력은 작성자) | `ExpenseDetailResponse` |
| POST | `/api/trips/:tripId/expenses/:expenseId/duplicate-dismissal` | 진행 중(직접 입력은 예정도) | 결제자(직접 입력은 작성자) | `ExpenseDetailResponse` (200) |
| GET | `/api/trips/:tripId/out-of-period-candidates?side=BEFORE\|AFTER` | 진행 중 | 본인 거래 · accountLink | `OutOfPeriodCandidate[]` |
| POST | `/api/trips/:tripId/out-of-period-expenses` | 진행 중 | 본인 거래 · accountLink | 201 `AddOutOfPeriodExpensesResponse` |
| POST | `/api/trips/:tripId/expenses` | 예정·진행 중 | 멤버(작성자가 된다) | 201 `ExpenseDetailResponse` |
| PATCH | `/api/trips/:tripId/expenses/:expenseId` | 예정·진행 중 | 작성자 · 직접 입력만 | `ExpenseDetailResponse` |
| DELETE | `/api/trips/:tripId/expenses/:expenseId?version=` | 예정·진행 중 | 작성자 · 직접 입력만 | 204 |

accountLink = 기능 플래그 `FEATURE_ACCOUNT_LINK`(기본 false). 꺼져 있으면 404(FR-006).

## 규칙

- **가시성(I-8)**: 모든 조회에 `visibleExpenseWhere(me)` = `refundOfExpenseId IS NULL AND (status = SHARED OR payer = me)`와 `tripId`를 함께 건다. 남의 미확정·개인·취소 자식·다른 여정 결제는 상세도 404.
- **종료 후 미확정**: `trip.ended` 리스너가 PENDING → PERSONAL(멱등). 리스너가 실패해도 조회 시점에 남은 PENDING을 다시 전환하고(실패해도 조회는 계속), 응답은 종료 여정의 PENDING을 PERSONAL로 내보낸다(`effectiveStatus`). `personalizePendingExpenses(tx, tripId)`는 S2A가 종료 트랜잭션 안에서 직접 불러도 된다.
- **분류**: 전이·로그 action은 `CLASSIFICATION_TRANSITIONS`. 같은 상태·같은 부담 인원이면 변경 없이 200(version 무관). 공동 → 개인은 `confirmSharedToPersonal: true` 필요(없으면 409 `SHARED_TO_PERSONAL_CONFIRM_REQUIRED`). 부담 인원을 생략하면 미확정·개인 → 공동은 활성 멤버 전원, 공동 → 공동은 그대로.
- **부담 인원**: 활성 멤버 + 지금 부담 인원에 있는 나간 멤버(해제만). 그 밖은 400 `PARTICIPANT_NOT_MEMBER`(`details.invalidMembershipIds`). `splitEvenly`로 1인 = floor, 나머지는 결제자(없으면 가입 순 첫 사람). 결제자 혼자 선택은 서버가 막지 않는다(Q-08은 화면에서).
- **변경됨**: SHARED가 된 뒤의 부담 인원 변경·공동 → 개인, 그리고 예전에 공개됐던 개인 → 공동. 결제자에게는 `flags.changed = false`.
- **잠금·동시성(8-3)**: 변경은 한 트랜잭션에서 Trip `FOR SHARE` → 여정 advisory lock → 그룹 멤버 `FOR SHARE` → Expense `FOR UPDATE` 순으로 잡고 단계(409 `EXPENSE_LOCKED`)·멤버십(404)·가시성(404)·결제자 나감(409 `EXPENSE_LOCKED`)·결제자(403 `NOT_PAYER`)·version(409 `VERSION_CONFLICT`, `details.current`)을 다시 확인한다.
- **중복 의심**: 공동이 될 때 `flagDuplicates`가 판정(다른 결제자·같은 가맹점 키·원통화 금액·±120초). 공동 → 개인이면 묶음에서 빠지고 1건만 남으면 해제. 표시 해제는 묶음 전체에 `duplicateDismissedAt`을 남기고 groupId는 유지해 같은 쌍을 다시 묶지 않는다. 인입(S2B-1)이 공동 결제의 순액을 바꾸면 `flagDuplicates`를 다시 부른다.
- **기간 외 추가**: 제공자 즉시 조회 결과만 응답하며 저장하지 않는다. 5분 유효 서명을 검증하고 제공자에서 재확인한 선택 건을 Transaction과 PENDING Expense로 함께 저장한다. 이미 추가·전액 취소·범위 밖 등 유효하지 않은 후보가 있으면 전체를 거절한다. 부분 취소는 자식으로 붙이고 환율이 없으면 503을 반환한다. 여정 통화도 KRW도 아닌 외화는 고정 환율 대신 결제 시점 시장 환율, 카드사 원화 여정이면 카드사 원화 우선(C-32, `krw.ts`).
- **직접 입력(S7, 명세 v0.6.0 4-11)**: `origin = MANUAL`, 작성자 `createdByMembershipId`. 여정에서 추가하면 나누기로 바로 SHARED/PERSONAL(결제자 외 1명 이상 = 공동), 지갑에서 추가하면 PENDING(결제자 = 작성자 = 나). 작성자 ≠ 결제자면 항상 SHARED(I-13, 지갑 기록 불가). 수정·삭제·분류·분담·중복 해제 권한은 작성자. 잠금 = 종료 또는 작성자·결제자 나감. 지갑 거래(`Transaction.source = MANUAL`)와 연결된 결제는 금액·통화·내용·시각을 서로 반영하고 결제자는 나로 고정. 여정 쪽 삭제는 지갑 항목을 남기고 연결만 끊는다. 결제수단 0개 규칙(NO_ACTIVE_PAYMENT_METHOD)은 직접 입력에 걸지 않는다. 지갑 쪽 규칙은 `src/wallet`.
- **직접 입력 중복 의심(Q-42)**: 둘 중 하나라도 직접 입력이면 같은 여정·같은 원화 순액·±30분이면 결제자와 상관없이 묶는다. 금액·시각을 고치면 묶음에서 뺐다가 다시 판정한다.
- **삭제 이력(Q-47)**: 직접 입력 결제 삭제는 하드 삭제(부담·변경 이력 CASCADE). 접근 기록 `DELETE_EXPENSE`(행위자·결제 ID·공동 여부 숫자)만 남는다.
- 접근 기록은 S2D `@Audited`(목록 LIST_EXPENSES·상세 VIEW_EXPENSE_DETAIL·후보 VIEW_CANDIDATES·분류 CLASSIFY_EXPENSE, ID만).

## 다른 모듈이 쓰는 것

- `ExpenseStatsService.personalCountsByPayer(tripId, tx?)` — 결제자별 개인 결제 건수(SettlementMember.personalCount).
- `ExpenseQueryService.paymentsByPayer(tripId, viewer, payer)` — 정산 멤버별 내역(FR-703): 공동 목록, 개인 건수, 본인이면 개인 목록.
- `personalizePendingExpenses(tx, tripId)` — 종료 처리(이벤트 계약은 `src/trips/events.ts`의 `TRIP_EVENTS.ENDED`·`TripEndedEvent`).
- 리스너는 AppModule의 `EventEmitterModule.forRoot()`(S2A)로 돈다. S2A는 종료 트랜잭션에서 미확정을 바꾸지 않고 이 리스너에 맡기며, 남아 있으면 자동 종료 잡이 `redelivered: true`로 다시 보낸다.

## 테스트

- 단위: `expense-rules.spec.ts`(가시성·권한·전이표·분담), `expense-view.spec.ts`(응답 조립), `helpers.spec.ts`(KST·커서·중복·원화).
- e2e: `test/expenses.e2e-spec.ts` — 실제 DB(`pnpm db:up` + `db:migrate:deploy`). DB에 접속할 수 없으면(CI) 건너뛴다. 만든 행만 지운다.
