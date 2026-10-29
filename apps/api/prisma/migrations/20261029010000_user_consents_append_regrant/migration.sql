-- 동의 재동의를 새 행으로 쌓는다(기능명세 4-10 v0.5.7, S4).
-- 전체 UNIQUE(user_id, consent_id, version) 때문에 철회된 동의와 같은 버전으로 다시 동의하면 새 행이 skipDuplicates로 버려져
-- 철회 행만 남고 연결 API가 403 CONSENT_REQUIRED를 반복했다. 유일성은 "유효한 행"(agreed이고 철회되지 않음)에만 건다.
-- 하위 호환: 옛 리비전의 createMany(skipDuplicates = ON CONFLICT DO NOTHING, 대상 없음)는 부분 유니크에도 그대로 동작한다.
-- 기존 데이터는 전체 UNIQUE를 지켜 왔으므로 부분 유니크 생성이 실패하지 않는다.

-- DropIndex
DROP INDEX "user_consents_user_id_consent_id_version_key";

-- CreateIndex
CREATE INDEX "user_consents_user_id_consent_id_version_idx" ON "user_consents"("user_id", "consent_id", "version");

-- 부분 유니크(Prisma 스키마로 표현할 수 없다. 다음 migrate dev가 지우지 않는다 — prisma/README.md "DB 제약")
CREATE UNIQUE INDEX "user_consents_active_key" ON "user_consents"("user_id", "consent_id", "version") WHERE "agreed" AND "withdrawn_at" IS NULL;
