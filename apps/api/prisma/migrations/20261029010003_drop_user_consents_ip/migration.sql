-- 동의 기록 IP 평문 → HMAC 이관의 contract 단계(prisma/README.md "동의 기록 IP" 4).
-- 확인: 운영 파기 배치 수동 실행에서 CONSENT_IP_PLAINTEXT count = 0, hasMore = false(평문 0건).
-- 하위 호환: 마이그레이션이 먼저 적용되고 새 리비전이 뜨기 전까지 옛 리비전(#33)이 트래픽을 받을 수 있다.
--   옛 리비전의 요청 경로는 이 컬럼을 읽거나 쓰지 않는다(createMany는 넘긴 컬럼만 INSERT, 나머지는 select 지정·updateMany·count·deleteMany).
--   이 컬럼을 쓰는 것은 내부 잡 consent-ip-backfill(수동, Scheduler 잡 없음)과 파기 배치의 CONSENT_IP_PLAINTEXT 단계(매일 04:00 KST)뿐이다.
--   그 창에 옛 리비전에서 돌면 그 단계에서 실행이 500으로 끝나고(앞 단계는 단계별 트랜잭션이라 커밋됨, 뒤 단계는 미실행)
--   Scheduler 재시도(최대 3회, 5~60초)가 새 리비전에서 다시 돈다. 데이터가 잘못 바뀌지는 않는다.

-- AlterTable
ALTER TABLE "user_consents" DROP COLUMN "ip";
