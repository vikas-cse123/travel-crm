-- Activate Phase 11 vendor permissions for every existing tenant. Grants are
-- additive and limited to shipped system roles and permission templates.

INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt")
VALUES
  (gen_random_uuid(), 'vendors.view', 'vendors', 'view', 'View active vendors', true, NOW()),
  (gen_random_uuid(), 'vendors.create', 'vendors', 'create', 'Create vendors', true, NOW()),
  (gen_random_uuid(), 'vendors.update', 'vendors', 'update', 'Edit vendor profiles', true, NOW()),
  (gen_random_uuid(), 'vendors.delete', 'vendors', 'delete', 'Archive vendors', true, NOW()),
  (gen_random_uuid(), 'vendors.view_all', 'vendors', 'view_all', 'View inactive and archived vendors', true, NOW()),
  (gen_random_uuid(), 'vendors.manage_services', 'vendors', 'manage_services', 'Manage vendor services and rates', true, NOW()),
  (gen_random_uuid(), 'vendors.manage_contacts', 'vendors', 'manage_contacts', 'Manage vendor contacts', true, NOW()),
  (gen_random_uuid(), 'vendors.manage_documents', 'vendors', 'manage_documents', 'Manage vendor documents', true, NOW()),
  (gen_random_uuid(), 'vendors.view_financials', 'vendors', 'view_financials', 'View vendor costs and balances', true, NOW()),
  (gen_random_uuid(), 'vendors.manage_payables', 'vendors', 'manage_payables', 'Manage vendor payables', true, NOW()),
  (gen_random_uuid(), 'vendors.manage_payments', 'vendors', 'manage_payments', 'Record and reverse vendor payments', true, NOW()),
  (gen_random_uuid(), 'vendors.view_bank_details', 'vendors', 'view_bank_details', 'View full vendor bank details', true, NOW()),
  (gen_random_uuid(), 'vendors.export', 'vendors', 'export', 'Export vendor records', true, NOW()),
  (gen_random_uuid(), 'vendors.change_status', 'vendors', 'change_status', 'Activate, deactivate or archive vendors', true, NOW())
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description",
  "isAvailable" = true;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON (
  r."name" = 'Owner'
  OR (r."name" = 'Manager' AND p."key" <> 'vendors.view_bank_details')
  OR (r."name" = 'Sales Executive' AND p."key" = 'vendors.view')
  OR (r."name" = 'Data Entry' AND p."key" IN (
    'vendors.view', 'vendors.create', 'vendors.update',
    'vendors.manage_contacts', 'vendors.manage_documents'
  ))
  OR (r."name" = 'View Only' AND p."key" = 'vendors.view')
)
WHERE r."isSystem" = true AND p."key" LIKE 'vendors.%'
ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW()
FROM "permission_templates" t
JOIN "permissions" p ON (
  (t."name" = 'Manager' AND p."key" <> 'vendors.view_bank_details')
  OR (t."name" = 'Sales Executive' AND p."key" = 'vendors.view')
  OR (t."name" = 'Data Entry' AND p."key" IN (
    'vendors.view', 'vendors.create', 'vendors.update',
    'vendors.manage_contacts', 'vendors.manage_documents'
  ))
  OR (t."name" = 'View Only' AND p."key" = 'vendors.view')
)
WHERE t."deletedAt" IS NULL
  AND t."name" IN ('Manager', 'Sales Executive', 'Data Entry', 'View Only')
  AND p."key" LIKE 'vendors.%'
ON CONFLICT DO NOTHING;
