ALTER TABLE "scholarship_applications" DROP CONSTRAINT "scholarship_applications_story_check";--> statement-breakpoint
ALTER TABLE "community_reports" DROP CONSTRAINT "community_reports_story_check";--> statement-breakpoint
ALTER TABLE "community_groups" ALTER COLUMN "link_checked_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "community_groups" ALTER COLUMN "admin_unchanged" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scholarship_applications" ADD CONSTRAINT "scholarship_applications_story_check" CHECK (char_length("scholarship_applications"."story") <= 16000);--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_story_check" CHECK ("community_reports"."story" IS NULL OR char_length("community_reports"."story") <= 8000);