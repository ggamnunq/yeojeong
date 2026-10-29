-- 거래 내역 파일 가져오기(W11): 알리페이 공급자 값만 추가한다(expand). 이 마이그레이션 안에서 새 값을 쓰지 않는다
-- (PostgreSQL은 ADD VALUE와 같은 트랜잭션에서 새 값을 쓰면 실패한다). 제약(transactions_import_provider_check ·
-- transactions_file_import_ref_key)은 공급자와 무관해 그대로 둔다.

-- AlterEnum
ALTER TYPE "file_import_provider" ADD VALUE 'ALIPAY';
