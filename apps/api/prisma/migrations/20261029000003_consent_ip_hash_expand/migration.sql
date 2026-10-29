-- expand: 동의 기록 접속 IP를 평문 대신 HMAC-SHA256(AUDIT_HMAC_KEY)으로 남긴다.
-- 새 코드는 ip_hash만 쓰고 ip는 비운다. 옛 리비전은 계속 ip를 쓸 수 있도록 컬럼은 남기고 NOT NULL만 푼다.
-- 기존 평문은 내부 잡(consent-ip-backfill, 파기 배치 CONSENT_IP_PLAINTEXT 단계)이 해시로 옮긴 뒤 NULL로 지운다.
-- 평문 컬럼 DROP은 운영에서 0건을 확인한 뒤 별도 contract 마이그레이션으로 한다.
ALTER TABLE "user_consents" ADD COLUMN "ip_hash" CHAR(64);
ALTER TABLE "user_consents" ALTER COLUMN "ip" DROP NOT NULL;
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_ip_hash_check" CHECK ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{64}$');
