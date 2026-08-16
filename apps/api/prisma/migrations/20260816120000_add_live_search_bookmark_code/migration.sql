-- Add the public, human-readable bookmark code (HTL-xxxxxx / FLT-xxxxxx).
-- Backfill existing rows deterministically (hotels first, then flights, ordered
-- by createdAt), then enforce NOT NULL + unique. The unique constraint is
-- global so a code is never reused, even across tenants or after deletion.
ALTER TABLE "live_search_bookmarks" ADD COLUMN "bookmarkCode" VARCHAR(20);

-- Backfill: assign sequential codes per type to pre-existing bookmarks.
WITH numbered AS (
  SELECT
    "id",
    "type",
    ROW_NUMBER() OVER (
      PARTITION BY "type"
      ORDER BY "createdAt", "id"
    ) AS seq
  FROM "live_search_bookmarks"
)
UPDATE "live_search_bookmarks" AS b
SET "bookmarkCode" =
  CASE
    WHEN n."type" = 'HOTEL' THEN 'HTL-' || LPAD(n.seq::text, 6, '0')
    ELSE 'FLT-' || LPAD(n.seq::text, 6, '0')
  END
FROM numbered n
WHERE b."id" = n."id"
  AND b."bookmarkCode" IS NULL;

-- Safety net: any row that somehow has no code yet (e.g. inserted between the
-- ADD COLUMN and this backfill) is still guaranteed a unique code.
DO $$
DECLARE
  next_hotel INT;
  next_flight INT;
BEGIN
  SELECT COALESCE(MAX(seq), 0) + 1 INTO next_hotel
  FROM (SELECT (RIGHT("bookmarkCode", 6))::int AS seq
        FROM "live_search_bookmarks" WHERE "type" = 'HOTEL') t;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO next_flight
  FROM (SELECT (RIGHT("bookmarkCode", 6))::int AS seq
        FROM "live_search_bookmarks" WHERE "type" = 'FLIGHT') t;

  UPDATE "live_search_bookmarks" SET "bookmarkCode" = 'HTL-' || LPAD(next_hotel::text, 6, '0')
  WHERE "bookmarkCode" IS NULL AND "type" = 'HOTEL';

  UPDATE "live_search_bookmarks" SET "bookmarkCode" = 'FLT-' || LPAD(next_flight::text, 6, '0')
  WHERE "bookmarkCode" IS NULL AND "type" = 'FLIGHT';
END $$;

ALTER TABLE "live_search_bookmarks" ALTER COLUMN "bookmarkCode" SET NOT NULL;

CREATE UNIQUE INDEX "live_search_bookmarks_bookmarkCode_key" ON "live_search_bookmarks"("bookmarkCode");
