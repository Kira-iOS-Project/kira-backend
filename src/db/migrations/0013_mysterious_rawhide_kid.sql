CREATE TYPE "public"."bill_repeat_interval" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"period_start" date NOT NULL,
	"paid_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_payments_amount_check" CHECK ("bill_payments"."amount" between 1 and 10000000000000)
);
--> statement-breakpoint
CREATE TABLE "recurring_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"linked_debt_account_id" uuid,
	"name" varchar(80) NOT NULL,
	"amount" bigint NOT NULL,
	"category" "transaction_category" NOT NULL,
	"next_due_date" date NOT NULL,
	"repeat_interval" "bill_repeat_interval" NOT NULL,
	"installments_total" smallint,
	"installments_remaining" smallint,
	"archived_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_bills_amount_check" CHECK ("recurring_bills"."amount" between 1 and 10000000000000),
	CONSTRAINT "recurring_bills_installments_check" CHECK (("recurring_bills"."installments_total" is null and "recurring_bills"."installments_remaining" is null) or ("recurring_bills"."installments_total" between 1 and 600 and "recurring_bills"."installments_remaining" between 0 and "recurring_bills"."installments_total"))
);
--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_recurring_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."recurring_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_linked_debt_account_id_debt_accounts_id_fk" FOREIGN KEY ("linked_debt_account_id") REFERENCES "public"."debt_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payments_user_client_idx" ON "bill_payments" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "bill_payments_bill_period_idx" ON "bill_payments" USING btree ("bill_id","period_start");--> statement-breakpoint
CREATE INDEX "bill_payments_user_period_idx" ON "bill_payments" USING btree ("user_id","period_start");--> statement-breakpoint
CREATE INDEX "bill_payments_transaction_idx" ON "bill_payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "recurring_bills_user_due_idx" ON "recurring_bills" USING btree ("user_id","archived_at","next_due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_bills_user_client_idx" ON "recurring_bills" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "recurring_bills_debt_account_idx" ON "recurring_bills" USING btree ("linked_debt_account_id");