CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" varchar(100) NOT NULL,
	"utility_type" varchar(20) NOT NULL,
	"billing_period_start" date NOT NULL,
	"billing_period_end" date NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"usage" numeric(10, 4) NOT NULL,
	"usage_unit" varchar(20) NOT NULL,
	"unit_price" numeric(10, 6) NOT NULL,
	"charges" jsonb NOT NULL,
	"storage_ref" varchar(500) NOT NULL,
	"uploaded_by" uuid,
	"parse_status" varchar(20) DEFAULT 'success' NOT NULL,
	"parse_error" text,
	"raw_text" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "household_members_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" varchar(255) NOT NULL,
	"address" varchar(500),
	"owner_id" uuid NOT NULL,
	"invite_code" varchar(6) NOT NULL,
	"invite_code_rotated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "households_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;