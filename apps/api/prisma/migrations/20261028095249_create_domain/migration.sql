-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('UPCOMING', 'ONGOING', 'ENDED');

-- CreateEnum
CREATE TYPE "end_reason" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "leave_reason" AS ENUM ('LEFT', 'KICKED');

-- CreateEnum
CREATE TYPE "expense_status" AS ENUM ('PENDING', 'PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "expense_origin" AS ENUM ('AUTO', 'OUT_OF_PERIOD');

-- CreateEnum
CREATE TYPE "fx_policy" AS ENUM ('SPOT_AT_PAYMENT', 'CARD_BILLED', 'FIXED');

-- CreateEnum
CREATE TYPE "provider" AS ENUM ('TOSS', 'DEMO');

-- CreateEnum
CREATE TYPE "connection_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "payment_method_type" AS ENUM ('ACCOUNT', 'CARD');

-- CreateEnum
CREATE TYPE "payment_method_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REMOVED');

-- CreateEnum
CREATE TYPE "attempt_purpose" AS ENUM ('SIGNUP', 'WALLET_ADD', 'RECONNECT');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('WAITING', 'AUTHORIZED', 'CONFIRMED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "tx_kind" AS ENUM ('APPROVAL', 'CANCEL');

-- CreateEnum
CREATE TYPE "consent_id" AS ENUM ('TOS', 'PRIVACY', 'AGE14', 'MARKETING', 'FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "rate_type" AS ENUM ('MID');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('OK', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "trip_event_type" AS ENUM ('LEADER_CHANGED', 'FX_POLICY_CHANGED');

-- CreateEnum
CREATE TYPE "change_action" AS ENUM ('CONFIRM_PERSONAL', 'CONFIRM_SHARED', 'SHARED_TO_PERSONAL', 'PERSONAL_TO_SHARED', 'PARTICIPANTS_CHANGED', 'AUTO_PERSONAL_ON_END', 'OUT_OF_PERIOD_ADDED', 'REFUND_ATTACHED', 'DUPLICATE_FLAGGED', 'DUPLICATE_DISMISSED', 'FX_RECALCULATED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_viewed_trip_id" UUID,
ADD COLUMN     "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profile_image_synced_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "signup_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kakao_id" VARCHAR(32) NOT NULL,
    "kakao_nickname" VARCHAR(64),
    "profile_image_url" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consent_id" "consent_id" NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "doc_path" TEXT NOT NULL,
    "doc_hash" CHAR(64) NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL,
    "change_type" VARCHAR(8) NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "user_ref_hash" CHAR(64) NOT NULL,
    "consent_id" "consent_id" NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "agreed" BOOLEAN NOT NULL,
    "agreed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" INET NOT NULL,
    "ua" VARCHAR(512) NOT NULL,
    "screen" VARCHAR(16) NOT NULL,
    "method" VARCHAR(12) NOT NULL,
    "doc_hash" CHAR(64) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ,
    "withdraw_channel" VARCHAR(16),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "user_ref_hash" CHAR(64) NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "request_code_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(20) NOT NULL,
    "invite_code" CHAR(6) NOT NULL,
    "created_by_user_id" UUID,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "place_label" VARCHAR(40) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "city" VARCHAR(40),
    "currency" CHAR(3) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "auto_end_at" TIMESTAMPTZ NOT NULL,
    "budget_krw" INTEGER NOT NULL,
    "status" "trip_status" NOT NULL DEFAULT 'UPCOMING',
    "started_at" TIMESTAMPTZ,
    "started_by_membership_id" UUID,
    "ended_at" TIMESTAMPTZ,
    "ended_by_membership_id" UUID,
    "end_reason" "end_reason",
    "fx_policy" "fx_policy" NOT NULL DEFAULT 'SPOT_AT_PAYMENT',
    "fx_fixed_rate" DECIMAL(18,6),
    "fx_policy_changed_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "user_id" UUID,
    "role" "member_role" NOT NULL DEFAULT 'MEMBER',
    "join_order" INTEGER NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,
    "leave_reason" "leave_reason",
    "kicked_by_membership_id" UUID,
    "last_seen_trip_event_seq" BIGINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seq" BIGSERIAL NOT NULL,
    "trip_id" UUID NOT NULL,
    "type" "trip_event_type" NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_membership_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "provider" NOT NULL,
    "status" "connection_status" NOT NULL DEFAULT 'ACTIVE',
    "access_token_enc" BYTEA,
    "refresh_token_enc" BYTEA,
    "token_expires_at" TIMESTAMPTZ,
    "scope" TEXT,
    "connected_at" TIMESTAMPTZ NOT NULL,
    "expired_at" TIMESTAMPTZ,
    "last_synced_at" TIMESTAMPTZ,
    "last_sync_status" "sync_status",
    "last_sync_error_code" VARCHAR(40),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "provider" NOT NULL DEFAULT 'TOSS',
    "purpose" "attempt_purpose" NOT NULL,
    "reconnect_connection_id" UUID,
    "state_hash" CHAR(64) NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'WAITING',
    "connection_id" UUID,
    "candidates" JSONB,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "type" "payment_method_type" NOT NULL,
    "institution_name" VARCHAR(30) NOT NULL,
    "product_name" VARCHAR(40) NOT NULL,
    "short_label" VARCHAR(30) NOT NULL,
    "masked_number" VARCHAR(30) NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "external_ref" VARCHAR(128) NOT NULL,
    "linked_account_ref" VARCHAR(128),
    "status" "payment_method_status" NOT NULL DEFAULT 'ACTIVE',
    "last_synced_at" TIMESTAMPTZ,
    "sync_cursor" TEXT,
    "removed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "payment_method_id" UUID NOT NULL,
    "external_ref" VARCHAR(128) NOT NULL,
    "kind" "tx_kind" NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "merchant_name_raw" VARCHAR(100) NOT NULL,
    "merchant_key" VARCHAR(100) NOT NULL,
    "original_amount" DECIMAL(19,4) NOT NULL,
    "original_currency" CHAR(3) NOT NULL,
    "provider_krw_amount" INTEGER,
    "billed_krw_amount" INTEGER,
    "billed_at" TIMESTAMPTZ,
    "spot_rate_id" UUID,
    "spot_krw_amount" INTEGER,
    "provider_approval_ref" VARCHAR(128),
    "cancel_of_transaction_id" UUID,
    "same_user_duplicate_of_id" UUID,
    "raw_payload_enc" BYTEA,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "transaction_id" UUID,
    "payer_membership_id" UUID NOT NULL,
    "status" "expense_status" NOT NULL DEFAULT 'PENDING',
    "origin" "expense_origin" NOT NULL DEFAULT 'AUTO',
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "merchant_name" VARCHAR(100) NOT NULL,
    "original_amount" DECIMAL(19,4) NOT NULL,
    "original_currency" CHAR(3) NOT NULL,
    "krw_amount" INTEGER NOT NULL,
    "net_krw_amount" INTEGER,
    "fx_policy_applied" "fx_policy",
    "fx_rate" DECIMAL(18,6),
    "fx_rate_unit" INTEGER,
    "fx_rate_source" VARCHAR(40),
    "fx_rate_at" TIMESTAMPTZ,
    "refund_of_expense_id" UUID,
    "duplicate_group_id" UUID,
    "duplicate_dismissed_at" TIMESTAMPTZ,
    "duplicate_dismissed_by_membership_id" UUID,
    "first_shared_at" TIMESTAMPTZ,
    "changed_after_shared" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ,
    "auto_personalized_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_shares" (
    "expense_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "amount_krw" INTEGER NOT NULL,
    "is_remainder_holder" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_shares_pkey" PRIMARY KEY ("expense_id","membership_id")
);

-- CreateTable
CREATE TABLE "expense_change_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expense_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "actor_membership_id" UUID,
    "action" "change_action" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "display_unit" INTEGER NOT NULL DEFAULT 1,
    "rate_type" "rate_type" NOT NULL DEFAULT 'MID',
    "source" VARCHAR(40) NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "total_shared_krw" INTEGER NOT NULL,
    "shared_count" INTEGER NOT NULL,
    "member_count" INTEGER NOT NULL,
    "per_capita_krw" INTEGER NOT NULL,
    "fx_policy" "fx_policy" NOT NULL,
    "algorithm_version" VARCHAR(8) NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_members" (
    "settlement_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "paid_krw" INTEGER NOT NULL,
    "paid_count" INTEGER NOT NULL,
    "burden_krw" INTEGER NOT NULL,
    "net_krw" INTEGER NOT NULL,
    "personal_count" INTEGER NOT NULL,
    "is_left" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_members_pkey" PRIMARY KEY ("settlement_id","membership_id")
);

-- CreateTable
CREATE TABLE "settlement_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlement_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "from_membership_id" UUID NOT NULL,
    "to_membership_id" UUID NOT NULL,
    "amount_krw" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "trigger" VARCHAR(16) NOT NULL,
    "from_at" TIMESTAMPTZ NOT NULL,
    "to_at" TIMESTAMPTZ NOT NULL,
    "status" "sync_status",
    "fetched_count" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(40),
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "resource_type" VARCHAR(32) NOT NULL,
    "resource_id" UUID,
    "ip_hash" CHAR(64),
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_tickets_kakao_id_key" ON "signup_tickets"("kakao_id");

-- CreateIndex
CREATE INDEX "signup_tickets_expires_at_idx" ON "signup_tickets"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "consent_documents_consent_id_version_key" ON "consent_documents"("consent_id", "version");

-- CreateIndex
CREATE INDEX "user_consents_consent_id_version_idx" ON "user_consents"("consent_id", "version");

-- CreateIndex
CREATE INDEX "user_consents_user_ref_hash_idx" ON "user_consents"("user_ref_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_consents_user_id_consent_id_version_key" ON "user_consents"("user_id", "consent_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "account_deletions_request_code_hash_key" ON "account_deletions"("request_code_hash");

-- CreateIndex
CREATE INDEX "account_deletions_user_id_idx" ON "account_deletions"("user_id");

-- CreateIndex
CREATE INDEX "account_deletions_user_ref_hash_idx" ON "account_deletions"("user_ref_hash");

-- CreateIndex
CREATE INDEX "groups_invite_code_idx" ON "groups"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "trips_group_id_key" ON "trips"("group_id");

-- CreateIndex
CREATE INDEX "trips_status_auto_end_at_idx" ON "trips"("status", "auto_end_at");

-- CreateIndex
CREATE INDEX "memberships_user_id_left_at_idx" ON "memberships"("user_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_group_id_user_id_key" ON "memberships"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_group_id_join_order_key" ON "memberships"("group_id", "join_order");

-- CreateIndex
CREATE UNIQUE INDEX "trip_events_seq_key" ON "trip_events"("seq");

-- CreateIndex
CREATE INDEX "trip_events_trip_id_seq_idx" ON "trip_events"("trip_id", "seq");

-- CreateIndex
CREATE INDEX "payment_connections_user_id_idx" ON "payment_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_attempts_state_hash_key" ON "connection_attempts"("state_hash");

-- CreateIndex
CREATE INDEX "connection_attempts_user_id_idx" ON "connection_attempts"("user_id");

-- CreateIndex
CREATE INDEX "connection_attempts_expires_at_idx" ON "connection_attempts"("expires_at");

-- CreateIndex
CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_connection_id_external_ref_key" ON "payment_methods"("connection_id", "external_ref");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_at_idx" ON "transactions"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_payment_method_id_external_ref_key" ON "transactions"("payment_method_id", "external_ref");

-- CreateIndex
CREATE INDEX "expenses_trip_id_occurred_at_id_idx" ON "expenses"("trip_id", "occurred_at" DESC, "id");

-- CreateIndex
CREATE INDEX "expenses_trip_id_status_idx" ON "expenses"("trip_id", "status");

-- CreateIndex
CREATE INDEX "expenses_payer_membership_id_idx" ON "expenses"("payer_membership_id");

-- CreateIndex
CREATE INDEX "expenses_refund_of_expense_id_idx" ON "expenses"("refund_of_expense_id");

-- CreateIndex
CREATE INDEX "expenses_duplicate_group_id_idx" ON "expenses"("duplicate_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_trip_id_transaction_id_key" ON "expenses"("trip_id", "transaction_id");

-- CreateIndex
CREATE INDEX "expense_shares_membership_id_idx" ON "expense_shares"("membership_id");

-- CreateIndex
CREATE INDEX "expense_change_logs_expense_id_created_at_idx" ON "expense_change_logs"("expense_id", "created_at");

-- CreateIndex
CREATE INDEX "expense_change_logs_trip_id_idx" ON "expense_change_logs"("trip_id");

-- CreateIndex
CREATE INDEX "exchange_rates_quote_currency_effective_at_idx" ON "exchange_rates"("quote_currency", "effective_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_quote_currency_source_effective_at_key" ON "exchange_rates"("quote_currency", "source", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_trip_id_key" ON "settlements"("trip_id");

-- CreateIndex
CREATE INDEX "settlement_members_membership_id_idx" ON "settlement_members"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_transfers_settlement_id_seq_key" ON "settlement_transfers"("settlement_id", "seq");

-- CreateIndex
CREATE INDEX "sync_runs_connection_id_started_at_idx" ON "sync_runs"("connection_id", "started_at");

-- CreateIndex
CREATE INDEX "access_logs_user_id_at_idx" ON "access_logs"("user_id", "at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_last_viewed_trip_id_fkey" FOREIGN KEY ("last_viewed_trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_started_by_membership_id_fkey" FOREIGN KEY ("started_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_ended_by_membership_id_fkey" FOREIGN KEY ("ended_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_kicked_by_membership_id_fkey" FOREIGN KEY ("kicked_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_actor_membership_id_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_connections" ADD CONSTRAINT "payment_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_attempts" ADD CONSTRAINT "connection_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_attempts" ADD CONSTRAINT "connection_attempts_reconnect_connection_id_fkey" FOREIGN KEY ("reconnect_connection_id") REFERENCES "payment_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_attempts" ADD CONSTRAINT "connection_attempts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "payment_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "payment_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_spot_rate_id_fkey" FOREIGN KEY ("spot_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cancel_of_transaction_id_fkey" FOREIGN KEY ("cancel_of_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_same_user_duplicate_of_id_fkey" FOREIGN KEY ("same_user_duplicate_of_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_membership_id_fkey" FOREIGN KEY ("payer_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_refund_of_expense_id_fkey" FOREIGN KEY ("refund_of_expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_duplicate_dismissed_by_membership_id_fkey" FOREIGN KEY ("duplicate_dismissed_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_change_logs" ADD CONSTRAINT "expense_change_logs_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_change_logs" ADD CONSTRAINT "expense_change_logs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_change_logs" ADD CONSTRAINT "expense_change_logs_actor_membership_id_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_members" ADD CONSTRAINT "settlement_members_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_members" ADD CONSTRAINT "settlement_members_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "settlement_transfers_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "settlement_transfers_from_membership_id_fkey" FOREIGN KEY ("from_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "settlement_transfers_to_membership_id_fkey" FOREIGN KEY ("to_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "payment_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 아래는 Prisma 스키마로 표현할 수 없는 제약이라 직접 추가했다(prisma/README.md "DB 제약").
-- ─────────────────────────────────────────────────────────────

-- I-2: 그룹당 활성 그룹장은 1명
CREATE UNIQUE INDEX "memberships_active_leader_key" ON "memberships"("group_id") WHERE "role" = 'LEADER' AND "left_at" IS NULL;

-- 초대코드는 삭제되지 않은 그룹 안에서만 유일
CREATE UNIQUE INDEX "groups_invite_code_active_key" ON "groups"("invite_code") WHERE "deleted_at" IS NULL;

-- 회원·동의
ALTER TABLE "consent_documents" ADD CONSTRAINT "consent_documents_change_type_check" CHECK ("change_type" IN ('MAJOR', 'MINOR'));
ALTER TABLE "consent_documents" ADD CONSTRAINT "consent_documents_doc_hash_check" CHECK ("doc_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_screen_check" CHECK ("screen" IN ('WF-04', 'WF-05', 'WF-28', 'WF-42', 'WF-30', 'RECONSENT', 'SUPPORT'));
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_method_check" CHECK ("method" IN ('ALL', 'INDIVIDUAL', 'TOGGLE'));
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_withdraw_channel_check" CHECK ("withdraw_channel" IS NULL OR "withdraw_channel" IN ('WF-30', 'WF-27', 'SUPPORT', 'ACCOUNT_DELETED'));
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_withdrawn_check" CHECK (("withdrawn_at" IS NULL) = ("withdraw_channel" IS NULL));
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_doc_hash_check" CHECK ("doc_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_channel_check" CHECK ("channel" IN ('SUPPORT', 'IN_APP', 'KAKAO_UNLINK', 'INACTIVE'));

-- 그룹·여정
ALTER TABLE "groups" ADD CONSTRAINT "groups_invite_code_check" CHECK ("invite_code" ~ '^[2-9A-HJKMNP-Z]{6}$');
ALTER TABLE "groups" ADD CONSTRAINT "groups_name_check" CHECK (char_length(btrim("name")) >= 1);
ALTER TABLE "trips" ADD CONSTRAINT "trips_dates_check" CHECK ("end_date" >= "start_date" AND "auto_end_at" > "start_at");
ALTER TABLE "trips" ADD CONSTRAINT "trips_budget_krw_check" CHECK ("budget_krw" BETWEEN 1 AND 1000000000);
ALTER TABLE "trips" ADD CONSTRAINT "trips_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "trips" ADD CONSTRAINT "trips_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "trips" ADD CONSTRAINT "trips_fx_fixed_rate_check" CHECK (("fx_policy" <> 'FIXED' OR "fx_fixed_rate" IS NOT NULL) AND ("fx_fixed_rate" IS NULL OR "fx_fixed_rate" > 0));
ALTER TABLE "trips" ADD CONSTRAINT "trips_ended_check" CHECK ((("status" = 'ENDED') = ("ended_at" IS NOT NULL)) AND (("status" = 'ENDED') = ("end_reason" IS NOT NULL)));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_join_order_check" CHECK ("join_order" >= 1);
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_left_check" CHECK (("left_at" IS NULL) = ("leave_reason" IS NULL));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_kicked_by_check" CHECK ("kicked_by_membership_id" IS NULL OR "leave_reason" = 'KICKED');

-- 결제수단·인입(I-9: 마스킹 값만 저장, ACTIVE 연결만 토큰 보유)
ALTER TABLE "payment_connections" ADD CONSTRAINT "payment_connections_active_token_check" CHECK ("status" <> 'ACTIVE' OR "access_token_enc" IS NOT NULL);
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_masked_number_check" CHECK (strpos("masked_number", '*') > 0);
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_last4_check" CHECK ("last4" ~ '^[0-9]{2,4}$');
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_original_currency_check" CHECK ("original_currency" ~ '^[A-Z]{3}$');

-- 장부·정산
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_net_krw_amount_check" CHECK ((("refund_of_expense_id" IS NULL) = ("net_krw_amount" IS NOT NULL)) AND ("net_krw_amount" IS NULL OR "net_krw_amount" >= 0));
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_original_currency_check" CHECK ("original_currency" ~ '^[A-Z]{3}$');
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_refund_self_check" CHECK ("refund_of_expense_id" IS NULL OR "refund_of_expense_id" <> "id");
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_amount_krw_check" CHECK ("amount_krw" >= 0);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_check" CHECK ("rate" > 0 AND "display_unit" > 0);
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_counts_check" CHECK ("total_shared_krw" >= 0 AND "shared_count" >= 0 AND "member_count" >= 1);
ALTER TABLE "settlement_transfers" ADD CONSTRAINT "settlement_transfers_check" CHECK ("amount_krw" > 0 AND "from_membership_id" <> "to_membership_id");
