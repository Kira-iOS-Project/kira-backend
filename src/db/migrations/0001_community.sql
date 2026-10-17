CREATE TYPE "public"."community_category" AS ENUM('debt_free', 'stocks', 'crypto', 'finance_talk');--> statement-breakpoint
CREATE TYPE "public"."community_listing_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."community_platform" AS ENUM('whatsapp', 'telegram', 'discord');--> statement-breakpoint
CREATE TYPE "public"."community_product_kind" AS ENUM('course', 'consultation', 'ebook', 'event');--> statement-breakpoint
CREATE TYPE "public"."community_report_reason" AS ENUM('default_invite', 'guaranteed_profit', 'scam', 'data_or_jockey', 'inappropriate', 'other');--> statement-breakpoint
CREATE TYPE "public"."community_report_status" AS ENUM('open', 'reviewed');--> statement-breakpoint
CREATE TABLE "community_categories" (
	"key" "community_category" PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"rank" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_group_joins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opened_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "community_category" NOT NULL,
	"platform" "community_platform" NOT NULL,
	"member_count" integer NOT NULL,
	"summary" text NOT NULL,
	"about" text NOT NULL,
	"icon" text NOT NULL,
	"education_only" boolean NOT NULL,
	"admin_name" text NOT NULL,
	"admin_initials" text NOT NULL,
	"admin_verified_since" date NOT NULL,
	"rules" text[] NOT NULL,
	"invite_url" text,
	"link_checked_on" date NOT NULL,
	"admin_unchanged" boolean NOT NULL,
	"curation_rank" smallint NOT NULL,
	"status" "community_listing_status" DEFAULT 'active' NOT NULL,
	"suspended_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_groups_member_count_check" CHECK ("community_groups"."member_count" >= 0),
	CONSTRAINT "community_groups_three_rules_check" CHECK (cardinality("community_groups"."rules") = 3)
);
--> statement-breakpoint
CREATE TABLE "community_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "community_product_kind" NOT NULL,
	"title" text NOT NULL,
	"seller_name" text NOT NULL,
	"seller_initials" text NOT NULL,
	"seller_badge" text NOT NULL,
	"seller_role" text NOT NULL,
	"price" integer,
	"icon" text NOT NULL,
	"description" text NOT NULL,
	"meta" text NOT NULL,
	"contents_title" text NOT NULL,
	"contents" text[] NOT NULL,
	"affiliate" boolean NOT NULL,
	"investment_risk" boolean NOT NULL,
	"seller_url" text,
	"curation_rank" smallint NOT NULL,
	"status" "community_listing_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_products_price_check" CHECK ("community_products"."price" IS NULL OR "community_products"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" "community_report_reason" NOT NULL,
	"story" text,
	"status" "community_report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reports_story_check" CHECK ("community_reports"."story" IS NULL OR char_length("community_reports"."story") <= 500)
);
--> statement-breakpoint
CREATE TABLE "community_rules_consents" (
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_group_joins" ADD CONSTRAINT "community_group_joins_group_id_community_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_group_joins" ADD CONSTRAINT "community_group_joins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_category_community_categories_key_fk" FOREIGN KEY ("category") REFERENCES "public"."community_categories"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_group_id_community_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_rules_consents" ADD CONSTRAINT "community_rules_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_group_joins_group_idx" ON "community_group_joins" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "community_group_joins_user_idx" ON "community_group_joins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_groups_status_rank_idx" ON "community_groups" USING btree ("status","curation_rank");--> statement-breakpoint
CREATE INDEX "community_groups_category_idx" ON "community_groups" USING btree ("category");--> statement-breakpoint
CREATE INDEX "community_products_status_rank_idx" ON "community_products" USING btree ("status","curation_rank");--> statement-breakpoint
CREATE INDEX "community_products_kind_idx" ON "community_products" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "community_reports_one_open_idx" ON "community_reports" USING btree ("group_id","user_id") WHERE "community_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "community_reports_group_created_idx" ON "community_reports" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "community_reports_user_idx" ON "community_reports" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_rules_consents_user_version_idx" ON "community_rules_consents" USING btree ("user_id","version");