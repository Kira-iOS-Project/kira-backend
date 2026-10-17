ALTER TYPE "public"."snapshot_reason" ADD VALUE 'monthly';--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD COLUMN "measures" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "score_snapshots_user_period_monthly_idx" ON "score_snapshots" USING btree ("user_id","period_start") WHERE reason::text = 'monthly';