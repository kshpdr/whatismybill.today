CREATE TABLE IF NOT EXISTS "share_links" (
  "token"        varchar(64)  PRIMARY KEY,
  "household_id" uuid         NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "created_by"   uuid         NOT NULL REFERENCES "users"("id"),
  "label"        varchar(100),
  "expires_at"   timestamp,
  "created_at"   timestamp    NOT NULL DEFAULT now()
);
