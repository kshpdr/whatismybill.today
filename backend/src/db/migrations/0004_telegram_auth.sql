ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_id" varchar(32);
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_id_unique" UNIQUE ("telegram_id");
