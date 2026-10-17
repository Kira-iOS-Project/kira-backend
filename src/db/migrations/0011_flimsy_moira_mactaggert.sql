CREATE TYPE "public"."wallet_type" AS ENUM('cash', 'bank', 'e_wallet', 'other');--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"type" "wallet_type" NOT NULL,
	"opening_balance" bigint NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_opening_balance_check" CHECK ("wallets"."opening_balance" between 0 and 10000000000000)
);
--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallets_user_created_idx" ON "wallets" USING btree ("user_id","created_at" DESC NULLS LAST);