-- Activate Phase 8 quotation permissions and add the quotation-template module.
-- Grants are additive and limited to system roles and shipped default templates;
-- user-created roles/templates are intentionally untouched.

INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt")
VALUES
  (gen_random_uuid(), 'quotation_templates.view', 'quotation_templates', 'view', 'View quotation templates', true, NOW()),
  (gen_random_uuid(), 'quotation_templates.create', 'quotation_templates', 'create', 'Create quotation templates', true, NOW()),
  (gen_random_uuid(), 'quotation_templates.update', 'quotation_templates', 'update', 'Edit quotation templates', true, NOW()),
  (gen_random_uuid(), 'quotation_templates.delete', 'quotation_templates', 'delete', 'Archive quotation templates', true, NOW()),
  (gen_random_uuid(), 'quotations.view', 'quotations', 'view', 'View quotations', true, NOW()),
  (gen_random_uuid(), 'quotations.create', 'quotations', 'create', 'Create quotations', true, NOW()),
  (gen_random_uuid(), 'quotations.update', 'quotations', 'update', 'Edit quotations and create revisions', true, NOW()),
  (gen_random_uuid(), 'quotations.delete', 'quotations', 'delete', 'Archive quotations', true, NOW()),
  (gen_random_uuid(), 'quotations.send', 'quotations', 'send', 'Send finalized quotations', true, NOW()),
  (gen_random_uuid(), 'quotations.accept', 'quotations', 'accept', 'Accept or reject quotations internally', true, NOW()),
  (gen_random_uuid(), 'quotations.generate_pdf', 'quotations', 'generate_pdf', 'Generate quotation PDFs', true, NOW()),
  (gen_random_uuid(), 'quotations.view_costing', 'quotations', 'view_costing', 'View internal costs and margins', true, NOW())
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
    'quotations.view', 'quotations.create', 'quotations.update', 'quotations.send', 'quotations.generate_pdf'
  ))
  OR (r."name" = 'Data Entry' AND p."key" IN (
    'quotation_templates.view', 'quotations.view', 'quotations.create', 'quotations.update'
  ))
  OR (r."name" = 'View Only' AND p."key" = 'quotations.view')
)
WHERE r."isSystem" = true
  AND p."key" LIKE ANY (ARRAY['quotation_templates.%', 'quotations.%'])
ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW()
FROM "permission_templates" t
JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN (
    'quotations.view', 'quotations.create', 'quotations.update', 'quotations.send', 'quotations.generate_pdf'
  ))
  OR (t."name" = 'Data Entry' AND p."key" IN (
    'quotation_templates.view', 'quotations.view', 'quotations.create', 'quotations.update'
  ))
  OR (t."name" = 'View Only' AND p."key" = 'quotations.view')
)
WHERE t."deletedAt" IS NULL
  AND t."name" IN ('Manager', 'Sales Executive', 'Data Entry', 'View Only')
  AND p."key" LIKE ANY (ARRAY['quotation_templates.%', 'quotations.%'])
ON CONFLICT DO NOTHING;
