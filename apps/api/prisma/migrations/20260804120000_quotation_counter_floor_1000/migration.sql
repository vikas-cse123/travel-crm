-- Quotation counters store the last issued number. New quotation sequences now
-- start at QT-001000, so existing counters below the floor are raised to 999:
-- the next increment then yields QT-001000. Rows already at 999 or above are
-- left untouched (never moved backwards), template counters are not modified,
-- and re-running this migration is a no-op.
UPDATE "quotation_counters"
SET "quotationValue" = 999
WHERE "quotationValue" < 999;
