CREATE TYPE "public"."asset_class" AS ENUM('deposit', 'mutual_fund', 'government_bond', 'gold', 'stock', 'crypto', 'other');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"name" varchar(80) NOT NULL,
	"value" bigint NOT NULL,
	"valued_on" date NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_value_check" CHECK ("assets"."value" between 1 and 999999999999)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_user_idx" ON "assets" USING btree ("user_id");