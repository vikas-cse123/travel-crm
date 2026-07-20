-- Activate Phase 7 permissions for tenants created before this module.
UPDATE "permissions"
SET "isAvailable" = true
WHERE "key" IN (
  'followups.view', 'followups.create', 'followups.update', 'followups.delete'
);

-- Align protected default roles for every existing company.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON (
  (r."name" IN ('Owner', 'Manager') AND p."key" IN ('followups.view', 'followups.create', 'followups.update', 'followups.delete'))
  OR (r."name" IN ('Sales Executive', 'Data Entry') AND p."key" IN ('followups.view', 'followups.create', 'followups.update'))
  OR (r."name" = 'View Only' AND p."key" = 'followups.view')
)
WHERE r."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Align only the built-in quick-setup templates; custom templates are untouched.
INSERT INTO "permission_template_permissions" ("templateId", "permissionId")
SELECT t."id", p."id"
FROM "permission_templates" t
JOIN "permissions" p ON (
  (t."name" = 'Manager' AND p."key" IN ('followups.view', 'followups.create', 'followups.update', 'followups.delete'))
  OR (t."name" IN ('Sales Executive', 'Data Entry') AND p."key" IN ('followups.view', 'followups.create', 'followups.update'))
  OR (t."name" = 'View Only' AND p."key" = 'followups.view')
)
WHERE t."deletedAt" IS NULL
ON CONFLICT ("templateId", "permissionId") DO NOTHING;
