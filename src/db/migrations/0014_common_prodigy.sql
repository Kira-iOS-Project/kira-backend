CREATE TABLE "weekly_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"expense" bigint NOT NULL,
	"income" bigint NOT NULL,
	"note" varchar(160),
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_summaries_user_week_idx" ON "weekly_summaries" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_summaries_week_idx" ON "weekly_summaries" USING btree ("week_start");