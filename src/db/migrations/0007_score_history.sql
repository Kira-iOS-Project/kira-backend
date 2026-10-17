ALTER TYPE "public"."snapshot_reason" ADD VALUE 'monthly';--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD COLUMN "measures" jsonb;--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD COLUMN "monthly_on" date;--> statement-breakpoint
CREATE UNIQUE INDEX "score_snapshots_user_monthly_idx" ON "score_snapshots" USING btree ("user_id","monthly_on");