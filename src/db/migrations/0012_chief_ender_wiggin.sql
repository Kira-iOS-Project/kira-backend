CREATE TABLE "budgets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"income" bigint NOT NULL,
	"allocations" jsonb NOT NULL,
	"payday" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_income_check" CHECK ("budgets"."income" between 0 and 10000000000000)
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;