CREATE TYPE "public"."risk_profile" AS ENUM('conservative', 'moderate', 'aggressive');--> statement-breakpoint
CREATE TABLE "risk_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"answers" smallint[] NOT NULL,
	"profile" "risk_profile" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_profiles_answers_check" CHECK (cardinality("risk_profiles"."answers") = 5)
);
--> statement-breakpoint
ALTER TABLE "risk_profiles" ADD CONSTRAINT "risk_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;