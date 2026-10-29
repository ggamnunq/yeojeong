-- expand: 여행 장소를 자유 입력으로 바꾸고 통화는 사용자가 따로 고른다.
-- 새 코드는 country_code를 비워 둘 수 있다. 옛 리비전은 계속 country_code를 채워 쓰므로 컬럼과 형식 CHECK는 그대로 두고 NOT NULL만 푼다.
-- (CHECK "country_code ~ '^[A-Z]{2}$'"는 NULL을 통과시킨다.) 기존 행은 그대로 읽힌다.
ALTER TABLE "trips" ALTER COLUMN "country_code" DROP NOT NULL;
