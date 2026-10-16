CREATE TYPE "public"."consent_purpose" AS ENUM('core', 'ai_processing', 'weekly_summary');--> statement-breakpoint
CREATE TYPE "public"."focus" AS ENUM('track_spending', 'debt_free');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('in_review', 'waitlisted', 'accepted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('qris', 'app_store');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'young', 'plus');--> statement-breakpoint
CREATE TYPE "public"."scholarship_situation" AS ENUM('instalments_piling_up', 'chased_by_lender', 'income_stopped', 'medical_costs', 'other_hardship');--> statement-breakpoint
CREATE TYPE "public"."subscription_source" AS ENUM('purchase', 'scholarship');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."debt_kind" AS ENUM('paylater', 'online_loan', 'credit_card', 'vehicle', 'mortgage', 'family_loan');--> statement-breakpoint
CREATE TYPE "public"."debt_payment_status" AS ENUM('on_time', 'late', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('single', 'married');--> statement-breakpoint
CREATE TYPE "public"."protection" AS ENUM('bpjs_health', 'bpjs_employment', 'life_insurance', 'private_health');--> statement-breakpoint
CREATE TYPE "public"."score_band" AS ENUM('vulnerable', 'coping', 'healthy');--> statement-breakpoint
CREATE TYPE "public"."snapshot_reason" AS ENUM('health_check', 'recompute');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('person_text', 'person_receipt', 'drafts', 'manual_saved', 'remaining', 'no_drafts');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('person', 'kira');--> statement-breakpoint
CREATE TYPE "public"."transaction_category" AS ENUM('food', 'coffee', 'transport', 'shopping', 'bills', 'paylater_instalment', 'savings_deposit', 'insurance', 'entertainment', 'health', 'education', 'household', 'other_expense', 'salary', 'bonus', 'business', 'other_income');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('chat', 'manual', 'receipt', 'bank_import');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TABLE "auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"request_ip" varchar(64) NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_codes_attempts_check" CHECK ("auth_codes"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" varchar(20) NOT NULL,
	"decided_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token_hash" varchar(64) NOT NULL,
	"access_expires_at" timestamp (3) with time zone NOT NULL,
	"refresh_token_hash" varchar(64) NOT NULL,
	"previous_refresh_token_hash" varchar(64),
	"refresh_expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"request_ip" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"focus" "focus" DEFAULT 'track_spending' NOT NULL,
	"payday_day" smallint,
	"payday_end_of_month" boolean DEFAULT false NOT NULL,
	"hide_balances" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp (3) with time zone,
	"debt_emergency_mode_used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_payday_day_check" CHECK ("users"."payday_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"months" smallint NOT NULL,
	"amount" bigint NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gifts_months_check" CHECK ("gifts"."months" in (1, 3, 6)),
	CONSTRAINT "gifts_amount_check" CHECK ("gifts"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"plan" "plan" NOT NULL,
	"period" "billing_period" NOT NULL,
	"amount" bigint NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"period_start" timestamp (3) with time zone NOT NULL,
	"period_end" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_amount_check" CHECK ("invoices"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scholarship_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"situations" "scholarship_situation"[] NOT NULL,
	"story" text,
	"used_debt_emergency_mode" boolean NOT NULL,
	"status" "application_status" NOT NULL,
	"submitted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp (3) with time zone,
	"subscription_id" uuid,
	"result_email_sent_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scholarship_applications_situations_check" CHECK (cardinality("scholarship_applications"."situations") >= 1),
	CONSTRAINT "scholarship_applications_story_check" CHECK (char_length("scholarship_applications"."story") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "plan" NOT NULL,
	"period" "billing_period" NOT NULL,
	"source" "subscription_source" NOT NULL,
	"payment_method" "payment_method",
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp (3) with time zone NOT NULL,
	"current_period_end" timestamp (3) with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"reminder_sent_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "debt_kind" NOT NULL,
	"name" varchar(60) NOT NULL,
	"original_amount" bigint NOT NULL,
	"remaining_amount" bigint NOT NULL,
	"monthly_instalment" bigint NOT NULL,
	"remaining_tenor_months" smallint,
	"payment_status" "debt_payment_status" DEFAULT 'on_time' NOT NULL,
	"paid_off_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_accounts_amounts_check" CHECK ("debt_accounts"."remaining_amount" between 0 and "debt_accounts"."original_amount" and "debt_accounts"."monthly_instalment" >= 0),
	CONSTRAINT "debt_accounts_tenor_check" CHECK ("debt_accounts"."remaining_tenor_months" between 0 and 600)
);
--> statement-breakpoint
CREATE TABLE "financial_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"net_monthly_income" bigint,
	"essential_monthly_expenses" bigint,
	"emergency_fund" bigint,
	"monthly_savings" bigint,
	"other_assets" bigint,
	"property_assets" bigint,
	"dependents" smallint DEFAULT 0 NOT NULL,
	"marital_status" "marital_status",
	"protections" "protection"[] DEFAULT '{}' NOT NULL,
	"completed_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_profiles_amounts_check" CHECK ("financial_profiles"."net_monthly_income" >= 0 and "financial_profiles"."essential_monthly_expenses" >= 0 and "financial_profiles"."emergency_fund" >= 0 and "financial_profiles"."monthly_savings" >= 0 and "financial_profiles"."other_assets" >= 0 and "financial_profiles"."property_assets" >= 0),
	CONSTRAINT "financial_profiles_dependents_check" CHECK ("financial_profiles"."dependents" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"band" "score_band" NOT NULL,
	"indicators" jsonb NOT NULL,
	"reason" "snapshot_reason" NOT NULL,
	"period_start" date NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_snapshots_score_check" CHECK ("score_snapshots"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "bank_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"occurred_on" date NOT NULL,
	"description" varchar(255) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"category" "transaction_category" NOT NULL,
	"is_duplicate" boolean NOT NULL,
	CONSTRAINT "bank_import_rows_amount_check" CHECK ("bank_import_rows"."amount" between 1 and 10000000000000)
);
--> statement-breakpoint
CREATE TABLE "bank_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"row_count" integer NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"committed_at" timestamp (3) with time zone,
	"saved_count" integer,
	"skipped_count" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_imports_file_size_check" CHECK ("bank_imports"."file_size" between 1 and 10000000),
	CONSTRAINT "bank_imports_dates_check" CHECK ("bank_imports"."date_to" >= "bank_imports"."date_from")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sender" "message_sender" NOT NULL,
	"kind" "message_kind" NOT NULL,
	"body" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reply_to_id" uuid,
	"client_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"category" "transaction_category" NOT NULL,
	"name" varchar(80) NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"note" varchar(280),
	"source" "transaction_source" NOT NULL,
	"source_message_id" uuid,
	"source_span_start" smallint,
	"source_span_end" smallint,
	"batch_id" uuid,
	"import_id" uuid,
	"client_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_check" CHECK ("transactions"."amount" between 1 and 10000000000000)
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"ai_messages" integer DEFAULT 0 NOT NULL,
	"receipts" integer DEFAULT 0 NOT NULL,
	"voice_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_user_id_period_start_pk" PRIMARY KEY("user_id","period_start"),
	CONSTRAINT "usage_counters_counts_check" CHECK ("usage_counters"."ai_messages" >= 0 and "usage_counters"."receipts" >= 0 and "usage_counters"."voice_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_applications" ADD CONSTRAINT "scholarship_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_applications" ADD CONSTRAINT "scholarship_applications_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_accounts" ADD CONSTRAINT "debt_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_profiles" ADD CONSTRAINT "financial_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_import_rows" ADD CONSTRAINT "bank_import_rows_import_id_bank_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_id_chat_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_message_id_chat_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_bank_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_codes_email_created_idx" ON "auth_codes" USING btree ("email","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "auth_codes_ip_created_idx" ON "auth_codes" USING btree ("request_ip","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "auth_codes_created_idx" ON "auth_codes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "consents_user_purpose_decided_idx" ON "consents" USING btree ("user_id","purpose","decided_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_access_token_hash_idx" ON "sessions" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_idx" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_previous_refresh_token_hash_idx" ON "sessions" USING btree ("previous_refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_email_created_idx" ON "sign_in_attempts" USING btree ("email","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "sign_in_attempts_ip_created_idx" ON "sign_in_attempts" USING btree ("request_ip","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "sign_in_attempts_created_idx" ON "sign_in_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "gifts_user_idx" ON "gifts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gifts_created_idx" ON "gifts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoices_user_created_idx" ON "invoices" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "invoices_subscription_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "scholarship_applications_user_submitted_idx" ON "scholarship_applications" USING btree ("user_id","submitted_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "scholarship_applications_status_submitted_idx" ON "scholarship_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "scholarship_applications_subscription_idx" ON "scholarship_applications" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scholarship_applications_one_open_idx" ON "scholarship_applications" USING btree ("user_id") WHERE "scholarship_applications"."status" in ('in_review', 'waitlisted');--> statement-breakpoint
CREATE INDEX "scholarship_applications_unsent_result_idx" ON "scholarship_applications" USING btree ("decided_at") WHERE "scholarship_applications"."status" = 'accepted' and "scholarship_applications"."result_email_sent_at" is null;--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_idx" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "subscriptions_status_period_end_idx" ON "subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE INDEX "debt_accounts_user_idx" ON "debt_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "score_snapshots_user_created_idx" ON "score_snapshots" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "score_snapshots_user_period_recompute_idx" ON "score_snapshots" USING btree ("user_id","period_start") WHERE "score_snapshots"."reason" = 'recompute';--> statement-breakpoint
CREATE INDEX "bank_import_rows_import_idx" ON "bank_import_rows" USING btree ("import_id","row_index");--> statement-breakpoint
CREATE INDEX "bank_imports_user_idx" ON "bank_imports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_user_created_idx" ON "chat_messages" USING btree ("user_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "chat_messages_reply_to_idx" ON "chat_messages" USING btree ("reply_to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_user_client_idx" ON "chat_messages" USING btree ("user_id","client_id") WHERE "chat_messages"."sender" = 'person';--> statement-breakpoint
CREATE INDEX "transactions_user_occurred_idx" ON "transactions" USING btree ("user_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "transactions_source_message_idx" ON "transactions" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "transactions_batch_idx" ON "transactions" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "transactions_import_idx" ON "transactions" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_client_idx" ON "transactions" USING btree ("user_id","client_id");