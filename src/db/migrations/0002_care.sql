CREATE TYPE "public"."care_signal_level" AS ENUM('concern', 'danger');--> statement-breakpoint
CREATE TYPE "public"."care_signal_source" AS ENUM('chat', 'check_in');--> statement-breakpoint
CREATE TYPE "public"."check_in_status" AS ENUM('scheduled', 'seen', 'cancelled');--> statement-breakpoint
CREATE TABLE "care_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "check_in_status" DEFAULT 'scheduled' NOT NULL,
	"due_at" timestamp (3) with time zone NOT NULL,
	"seen_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_safety_plans" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sealed" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" "care_signal_level" NOT NULL,
	"source" "care_signal_source" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care_check_ins" ADD CONSTRAINT "care_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_safety_plans" ADD CONSTRAINT "care_safety_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_signals" ADD CONSTRAINT "care_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_check_ins_user_status_due_idx" ON "care_check_ins" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "care_check_ins_one_pending_idx" ON "care_check_ins" USING btree ("user_id") WHERE "care_check_ins"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "care_signals_user_idx" ON "care_signals" USING btree ("user_id");