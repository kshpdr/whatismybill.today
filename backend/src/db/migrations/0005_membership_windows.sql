ALTER TABLE "household_members" DROP CONSTRAINT "household_members_household_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "household_members" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "household_members" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "household_members" ADD COLUMN "access_from" date;--> statement-breakpoint
ALTER TABLE "household_members" ADD COLUMN "access_until" date;--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_active_unique" ON "household_members" ("household_id","user_id") WHERE "access_until" IS NULL;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "access_from" date;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "access_until" date;
