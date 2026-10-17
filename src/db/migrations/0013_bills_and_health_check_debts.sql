CREATE TYPE "public"."bill_repeat" AS ENUM('once', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"category" "transaction_category" NOT NULL,
	"amount" bigint NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	"repeats" "bill_repeat" NOT NULL,
	"due_on" date NOT NULL,
	"last_paid_on" date,
	"debt_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_bills_amount_check" CHECK ("recurring_bills"."amount" between 1 and 10000000000000)
);
--> statement-breakpoint
ALTER TABLE "debt_accounts" ADD COLUMN "from_health_check" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_debt_id_debt_accounts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debt_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_bills_user_idx" ON "recurring_bills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_bills_debt_idx" ON "recurring_bills" USING btree ("debt_id");