-- Activate Phase 9 booking permissions. Grants are additive and limited to
-- system roles and the four shipped permission templates.

INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt")
VALUES
  (gen_random_uuid(), 'bookings.view', 'bookings', 'view', 'View bookings', true, NOW()),
  (gen_random_uuid(), 'bookings.create', 'bookings', 'create', 'Create manual bookings', true, NOW()),
  (gen_random_uuid(), 'bookings.update', 'bookings', 'update', 'Edit booking operations', true, NOW()),
  (gen_random_uuid(), 'bookings.delete', 'bookings', 'delete', 'Archive bookings', true, NOW()),
  (gen_random_uuid(), 'bookings.convert_from_quotation', 'bookings', 'convert_from_quotation', 'Convert accepted quotations to bookings', true, NOW()),
  (gen_random_uuid(), 'bookings.change_status', 'bookings', 'change_status', 'Change booking status', true, NOW()),
  (gen_random_uuid(), 'bookings.manage_travellers', 'bookings', 'manage_travellers', 'Manage booking travellers', true, NOW()),
  (gen_random_uuid(), 'bookings.manage_documents', 'bookings', 'manage_documents', 'Manage booking documents', true, NOW()),
  (gen_random_uuid(), 'bookings.view_sensitive_documents', 'bookings', 'view_sensitive_documents', 'View passport and identity documents', true, NOW()),
  (gen_random_uuid(), 'bookings.view_financials', 'bookings', 'view_financials', 'View booking revenue, costs and profit', true, NOW()),
  (gen_random_uuid(), 'bookings.manage_payments', 'bookings', 'manage_payments', 'Manage customer payments', true, NOW()),
  (gen_random_uuid(), 'bookings.manage_costs', 'bookings', 'manage_costs', 'Manage booking costs', true, NOW()),
  (gen_random_uuid(), 'bookings.send_confirmation', 'bookings', 'send_confirmation', 'Send booking confirmations and reminders', true, NOW()),
  (gen_random_uuid(), 'bookings.export', 'bookings', 'export', 'Generate booking confirmation documents', true, NOW()),
  (gen_random_uuid(), 'bookings.view_all', 'bookings', 'view_all', 'View all company bookings', true, NOW())
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
    'bookings.view', 'bookings.update', 'bookings.convert_from_quotation',
    'bookings.change_status', 'bookings.manage_travellers',
    'bookings.manage_documents', 'bookings.send_confirmation'
  ))
  OR (r."name" = 'Data Entry' AND p."key" IN (
    'bookings.view', 'bookings.update', 'bookings.manage_travellers', 'bookings.manage_documents'
  ))
  OR (r."name" = 'View Only' AND p."key" = 'bookings.view')
)
WHERE r."isSystem" = true AND p."key" LIKE 'bookings.%'
ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW()
FROM "permission_templates" t
JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN (
    'bookings.view', 'bookings.update', 'bookings.convert_from_quotation',
    'bookings.change_status', 'bookings.manage_travellers',
    'bookings.manage_documents', 'bookings.send_confirmation'
  ))
  OR (t."name" = 'Data Entry' AND p."key" IN (
    'bookings.view', 'bookings.update', 'bookings.manage_travellers', 'bookings.manage_documents'
  ))
  OR (t."name" = 'View Only' AND p."key" = 'bookings.view')
)
WHERE t."deletedAt" IS NULL
  AND t."name" IN ('Manager', 'Sales Executive', 'Data Entry', 'View Only')
  AND p."key" LIKE 'bookings.%'
ON CONFLICT DO NOTHING;
