-- Allow bills to be stored without a PDF (privacy mode: parse only, discard file)
ALTER TABLE bills ALTER COLUMN storage_ref DROP NOT NULL;
