-- Business IDs are lifetime sequences. Calendar years are intentionally not
-- embedded in the value (for example, QRY-000001 instead of QRY-2026-000001).
-- UUID relations remain untouched; only human-facing business numbers change.

UPDATE "queries" SET "queryNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "queries"
)
UPDATE "queries" q
SET "queryNumber" = 'QRY-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE q."id" = numbered."id";

UPDATE "customers" SET "customerNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "customers"
)
UPDATE "customers" c
SET "customerNumber" = 'CUS-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE c."id" = numbered."id";

UPDATE "quotation_templates" SET "templateCode" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "quotation_templates"
)
UPDATE "quotation_templates" t
SET "templateCode" = 'QTP-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE t."id" = numbered."id";

UPDATE "quotations" SET "quotationNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "quotations"
)
UPDATE "quotations" q
SET "quotationNumber" = 'QT-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE q."id" = numbered."id";

UPDATE "bookings" SET "bookingNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "bookings"
)
UPDATE "bookings" b
SET "bookingNumber" = 'BK-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE b."id" = numbered."id";

UPDATE "booking_payments" SET "paymentNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "booking_payments"
)
UPDATE "booking_payments" p
SET "paymentNumber" = 'PAY-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE p."id" = numbered."id";

UPDATE "booking_refunds" SET "refundNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "booking_refunds"
)
UPDATE "booking_refunds" r
SET "refundNumber" = 'REF-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE r."id" = numbered."id";

UPDATE "vendors" SET "vendorCode" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "vendors"
)
UPDATE "vendors" v
SET "vendorCode" = 'VEN-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE v."id" = numbered."id";

UPDATE "vendor_payables" SET "payableNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "vendor_payables"
)
UPDATE "vendor_payables" p
SET "payableNumber" = 'VP-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE p."id" = numbered."id";

UPDATE "vendor_payments" SET "paymentNumber" = 'TMP-' || LEFT(MD5("id"::text), 16);
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS seq
  FROM "vendor_payments"
)
UPDATE "vendor_payments" p
SET "paymentNumber" = 'VPAY-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered WHERE p."id" = numbered."id";

-- Seed the lifetime (year = 0) counters at the migrated row counts, so the
-- next generated number continues after existing records.
INSERT INTO "query_counters" ("companyId", "year", "value")
SELECT "companyId", 0, COUNT(*)::int FROM "queries" GROUP BY "companyId"
ON CONFLICT ("companyId", "year") DO UPDATE SET "value" = EXCLUDED."value";

INSERT INTO "customer_counters" ("companyId", "year", "value")
SELECT "companyId", 0, COUNT(*)::int FROM "customers" GROUP BY "companyId"
ON CONFLICT ("companyId", "year") DO UPDATE SET "value" = EXCLUDED."value";

INSERT INTO "quotation_counters" ("companyId", "year", "quotationValue", "templateValue")
SELECT c."id", 0,
       (SELECT COUNT(*)::int FROM "quotations" q WHERE q."companyId" = c."id"),
       (SELECT COUNT(*)::int FROM "quotation_templates" t WHERE t."companyId" = c."id")
FROM "companies" c
WHERE EXISTS (SELECT 1 FROM "quotations" q WHERE q."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "quotation_templates" t WHERE t."companyId" = c."id")
ON CONFLICT ("companyId", "year") DO UPDATE
SET "quotationValue" = EXCLUDED."quotationValue", "templateValue" = EXCLUDED."templateValue";

INSERT INTO "booking_counters" ("companyId", "year", "bookingValue", "paymentValue", "refundValue")
SELECT c."id", 0,
       (SELECT COUNT(*)::int FROM "bookings" b WHERE b."companyId" = c."id"),
       (SELECT COUNT(*)::int FROM "booking_payments" p WHERE p."companyId" = c."id"),
       (SELECT COUNT(*)::int FROM "booking_refunds" r WHERE r."companyId" = c."id")
FROM "companies" c
WHERE EXISTS (SELECT 1 FROM "bookings" b WHERE b."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "booking_payments" p WHERE p."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "booking_refunds" r WHERE r."companyId" = c."id")
ON CONFLICT ("companyId", "year") DO UPDATE
SET "bookingValue" = EXCLUDED."bookingValue",
    "paymentValue" = EXCLUDED."paymentValue",
    "refundValue" = EXCLUDED."refundValue";

INSERT INTO "vendor_counters" ("companyId", "year", "vendorValue", "payableValue", "paymentValue")
SELECT c."id", 0,
       (SELECT COUNT(*)::int FROM "vendors" v WHERE v."companyId" = c."id"),
       (SELECT COUNT(*)::int FROM "vendor_payables" p WHERE p."companyId" = c."id"),
       (SELECT COUNT(*)::int FROM "vendor_payments" p WHERE p."companyId" = c."id")
FROM "companies" c
WHERE EXISTS (SELECT 1 FROM "vendors" v WHERE v."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "vendor_payables" p WHERE p."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "vendor_payments" p WHERE p."companyId" = c."id")
ON CONFLICT ("companyId", "year") DO UPDATE
SET "vendorValue" = EXCLUDED."vendorValue",
    "payableValue" = EXCLUDED."payableValue",
    "paymentValue" = EXCLUDED."paymentValue";
