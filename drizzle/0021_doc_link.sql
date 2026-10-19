ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "link" text;--> statement-breakpoint
-- Existing docs: the web link their body opens with (as topLink() in links.ts reads it); later saves keep it current.
UPDATE "docs" d SET "link" = coalesce(b.m[1], b.m[2], b.m[3])
FROM (
  SELECT org_id, doc_id, regexp_match(body, '^\s*(?:<!--[^\n]*-->\s*)*(?:<(https?://[^>\s]+)>|\[[^]\n]*\]\((https?://[^)\s]+)\)|(https?://[^\s<>]+))[ \t]*(?:\n|$)', 'i') AS m
  FROM doc_bodies
) b
WHERE b.org_id = d.org_id AND b.doc_id = d.id AND d.link IS NULL AND b.m IS NOT NULL
  AND length(coalesce(b.m[1], b.m[2], b.m[3])) <= 2048;
