-- 거래 내역 파일 가져오기(W10): enum 값만 추가한다(expand). 새 값은 이 마이그레이션 안에서 쓰지 않는다
-- (PostgreSQL은 ADD VALUE와 같은 트랜잭션에서 새 값을 쓰면 실패한다). 쓰는 쪽은 다음 마이그레이션(20261030040001)이다.

-- AlterEnum
ALTER TYPE "tx_source" ADD VALUE 'FILE_IMPORT';
