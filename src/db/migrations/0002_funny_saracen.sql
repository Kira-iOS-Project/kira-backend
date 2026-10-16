CREATE TYPE "public"."payoff_method" AS ENUM('snowball', 'avalanche');--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_payments_amount_check" CHECK ("debt_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payoff_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"method" "payoff_method" NOT NULL,
	"extra_payment" bigint NOT NULL,
	"focus_debt_id" uuid,
	"ended_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payoff_plans_extra_check" CHECK ("payoff_plans"."extra_payment" >= 0)
);
--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debt_accounts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debt_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payoff_plans" ADD CONSTRAINT "payoff_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payoff_plans" ADD CONSTRAINT "payoff_plans_focus_debt_id_debt_accounts_id_fk" FOREIGN KEY ("focus_debt_id") REFERENCES "public"."debt_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_payments_debt_paid_idx" ON "debt_payments" USING btree ("debt_id","paid_at");--> statement-breakpoint
CREATE INDEX "debt_payments_user_idx" ON "debt_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payoff_plans_focus_debt_idx" ON "payoff_plans" USING btree ("focus_debt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payoff_plans_user_active_idx" ON "payoff_plans" USING btree ("user_id") WHERE "payoff_plans"."ended_at" is null;