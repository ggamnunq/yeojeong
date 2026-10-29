-- 접근 기록에 숫자 요약(예: 결제수단 전부 해제 때 파기 건수)을 남긴다. nullable 추가라 옛 리비전은 영향이 없다.

-- AlterTable
ALTER TABLE "access_logs" ADD COLUMN "details" JSONB;
