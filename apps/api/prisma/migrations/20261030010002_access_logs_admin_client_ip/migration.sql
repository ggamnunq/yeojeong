-- 관리자 접근 기록(ADMIN_*)의 접속지 정보: 원 IP를 1년 보관한다(「개인정보의 안전성 확보조치 기준」 접속기록의 '접속지 정보',
-- 개인정보취급자 = 운영자 본인의 접속. 로그인 실패·시도 제한도 공격 추적용으로 남긴다). ip_hash는 그대로 둔다.
-- 일반 사용자 행은 지금처럼 HMAC만 — CHECK로 ADMIN_* 행에만 원 IP가 들어가게 막는다.
-- 하위 호환: nullable 컬럼 추가라 옛 리비전에 영향 없다.
ALTER TABLE "access_logs" ADD COLUMN "client_ip" INET;
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_client_ip_admin_only_check"
  CHECK ("client_ip" IS NULL OR "action" LIKE 'ADMIN\_%');
