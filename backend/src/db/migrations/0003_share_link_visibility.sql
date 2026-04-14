ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "visibility_config" jsonb NOT NULL DEFAULT '{"showPdf":true,"showCharges":true,"showUsage":true,"showChart":true,"showAddress":true,"visibleUtilityTypes":["electricity","gas","water"],"maxMonths":null}';
