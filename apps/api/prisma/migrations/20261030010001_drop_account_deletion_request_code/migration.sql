-- 탈퇴·삭제 요청 코드(POST /api/users/me/deletion-request, FR-108) 폐기(L-1). 이메일 탈퇴는 로그인할 수 없는 회원의 보조 경로로,
-- 운영자가 관리자 페이지에서 처리한다(channel = SUPPORT). 요청 코드 HMAC·만료 칸은 쓰는 곳이 없어 지운다(유니크 인덱스도 함께 사라진다).
-- 하위 호환: 옛 리비전에서 account_deletions를 읽고 쓰는 곳은 모두 select를 지정하거나(updateMany·count·deleteMany 포함) 이 칸을 쓰지 않는다.
-- 예외는 옛 리비전의 deletion-request 라우트 하나(이 칸에 쓴다)로, 마이그레이션 뒤 새 리비전이 뜨기 전 잠깐 500이 날 수 있다(새 화면은 부르지 않는다).
ALTER TABLE "account_deletions" DROP COLUMN "request_code_hash", DROP COLUMN "expires_at";
