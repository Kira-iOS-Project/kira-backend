CREATE TYPE "public"."goal_kind" AS ENUM('emergency_fund', 'house_dp', 'education', 'wedding', 'retirement', 'vehicle', 'goods', 'other');--> statement-breakpoint
CREATE TABLE "goal_deposits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"deposited_on" date NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_deposits_amount_check" CHECK ("goal_deposits"."amount" between 1 and 999999999999)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "goal_kind" NOT NULL,
	"name" varchar(60) NOT NULL,
	"inputs" jsonb NOT NULL,
	"initial_amount" bigint NOT NULL,
	"monthly_deposit" bigint NOT NULL,
	"target_amount" bigint NOT NULL,
	"target_date" date NOT NULL,
	"in_budget" boolean DEFAULT false NOT NULL,
	"emergency_owner" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_amounts_check" CHECK ("goals"."initial_amount" between 0 and 999999999999 and "goals"."monthly_deposit" between 0 and 999999999999 and "goals"."target_amount" between 1 and 999999999999)
);
--> statement-breakpoint
ALTER TABLE "goal_deposits" ADD CONSTRAINT "goal_deposits_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_deposits_goal_idx" ON "goal_deposits" USING btree ("goal_id","deposited_on");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_emergency_owner_idx" ON "goals" USING btree ("emergency_owner");