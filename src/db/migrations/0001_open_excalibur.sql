ALTER TABLE "debt_accounts" ADD COLUMN "annual_interest_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "debt_accounts" ADD COLUMN "due_day" smallint;--> statement-breakpoint
ALTER TABLE "debt_accounts" ADD CONSTRAINT "debt_accounts_rate_check" CHECK ("debt_accounts"."annual_interest_rate" between 0 and 300);--> statement-breakpoint
ALTER TABLE "debt_accounts" ADD CONSTRAINT "debt_accounts_due_day_check" CHECK ("debt_accounts"."due_day" between 1 and 31);