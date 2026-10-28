-- v0.5.5 I-11: 기간 외 후보는 제공자에서 즉시 조회하고, 사용자가 고른 건만 저장한다.
-- 이전 동기화가 여정 시작 60일 전부터 선저장한 Transaction 중 어느 Expense에도 붙지 않은 행을 파기한다.
-- 선저장 후 여정 종료·멤버 이탈·소프트 삭제가 되었더라도 대상으로 삼는다.
-- 다른 여정의 실제 기간 안에 드는 거래는 환율 고시 지연 등으로 아직 Expense가 없을 수 있으므로 보존한다.

WITH unused_pretrip AS (
  SELECT DISTINCT transaction_row."id"
  FROM "transactions" AS transaction_row
  JOIN "memberships" AS membership
    ON membership."user_id" = transaction_row."user_id"
  JOIN "groups" AS group_row
    ON group_row."id" = membership."group_id"
  JOIN "trips" AS trip
    ON trip."group_id" = group_row."id"
  WHERE transaction_row."occurred_at" >= trip."start_at" - INTERVAL '60 days'
    AND transaction_row."occurred_at" < trip."start_at"
    AND NOT EXISTS (
      SELECT 1 FROM "expenses" AS expense
      WHERE expense."transaction_id" = transaction_row."id"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "memberships" AS other_membership
      JOIN "groups" AS other_group
        ON other_group."id" = other_membership."group_id"
      JOIN "trips" AS other_trip
        ON other_trip."group_id" = other_group."id"
      WHERE other_membership."user_id" = transaction_row."user_id"
        AND transaction_row."occurred_at" >= other_trip."start_at"
        AND transaction_row."occurred_at" <= other_trip."auto_end_at"
    )
)
DELETE FROM "transactions"
WHERE "id" IN (SELECT "id" FROM unused_pretrip);
