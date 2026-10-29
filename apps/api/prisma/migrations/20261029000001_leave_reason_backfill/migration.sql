-- 계정 삭제는 user_id가 NULL인 기존 멤버십으로 구별한다.
UPDATE "memberships" SET "leave_reason" = 'ACCOUNT_DELETED', "kicked_by_membership_id" = NULL
WHERE "user_id" IS NULL AND "left_at" IS NOT NULL;
-- 그룹 삭제 당시 활성 멤버만 사유와 종료 시각을 채운다.
UPDATE "memberships" AS m SET "left_at" = g."deleted_at", "leave_reason" = 'GROUP_DELETED', "role" = 'MEMBER'
FROM "groups" AS g WHERE m."group_id" = g."id" AND g."deleted_at" IS NOT NULL AND m."left_at" IS NULL;
