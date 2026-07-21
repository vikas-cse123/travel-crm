-- Activate Phase 10 customer permissions. Grants are additive and limited to
-- system roles and the four shipped permission templates.

INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt")
VALUES
  (gen_random_uuid(), 'customers.view', 'customers', 'view', 'View customers', true, NOW()),
  (gen_random_uuid(), 'customers.create', 'customers', 'create', 'Create customers', true, NOW()),
  (gen_random_uuid(), 'customers.update', 'customers', 'update', 'Edit customers', true, NOW()),
  (gen_random_uuid(), 'customers.delete', 'customers', 'delete', 'Archive customers', true, NOW()),
  (gen_random_uuid(), 'customers.merge', 'customers', 'merge', 'Preview and merge duplicate customers', true, NOW()),
  (gen_random_uuid(), 'customers.manage_tags', 'customers', 'manage_tags', 'Manage customer tags', true, NOW()),
  (gen_random_uuid(), 'customers.manage_notes', 'customers', 'manage_notes', 'Manage customer notes and communications', true, NOW()),
  (gen_random_uuid(), 'customers.view_financials', 'customers', 'view_financials', 'View customer financial metrics', true, NOW()),
  (gen_random_uuid(), 'customers.view_documents', 'customers', 'view_documents', 'View and manage customer documents', true, NOW()),
  (gen_random_uuid(), 'customers.export', 'customers', 'export', 'Export customer records', true, NOW()),
  (gen_random_uuid(), 'customers.view_all', 'customers', 'view_all', 'View all company customers', true, NOW())
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description",
  "isAvailable" = true;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON (
  r."name" IN ('Owner', 'Manager')
  OR (r."name" = 'Sales Executive' AND p."key" IN (
    'customers.view', 'customers.create', 'customers.update',
    'customers.manage_notes', 'customers.view_documents'
  ))
  OR (r."name" = 'Data Entry' AND p."key" IN (
    'customers.view', 'customers.create', 'customers.update'
  ))
  OR (r."name" = 'View Only' AND p."key" = 'customers.view')
)
WHERE r."isSystem" = true AND p."key" LIKE 'customers.%'
ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW()
FROM "permission_templates" t
JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN (
    'customers.view', 'customers.create', 'customers.update',
    'customers.manage_notes', 'customers.view_documents'
  ))
  OR (t."name" = 'Data Entry' AND p."key" IN (
    'customers.view', 'customers.create', 'customers.update'
  ))
  OR (t."name" = 'View Only' AND p."key" = 'customers.view')
)
WHERE t."deletedAt" IS NULL
  AND t."name" IN ('Manager', 'Sales Executive', 'Data Entry', 'View Only')
  AND p."key" LIKE 'customers.%'
ON CONFLICT DO NOTHING;
