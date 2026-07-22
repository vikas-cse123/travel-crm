-- Phase 13C: register and grant the cruise/vehicle permissions.
-- Mirrors the Phase 13B activation migration. Idempotent via ON CONFLICT.

INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt") VALUES
  (gen_random_uuid(), 'masters.cruises.view', 'masters.cruises', 'view', 'View active cruises', true, NOW()),
  (gen_random_uuid(), 'masters.cruises.create', 'masters.cruises', 'create', 'Create cruises', true, NOW()),
  (gen_random_uuid(), 'masters.cruises.update', 'masters.cruises', 'update', 'Edit cruises and change status', true, NOW()),
  (gen_random_uuid(), 'masters.cruises.delete', 'masters.cruises', 'delete', 'Archive cruises', true, NOW()),
  (gen_random_uuid(), 'masters.cruises.manage_media', 'masters.cruises', 'manage_media', 'Manage cruise images', true, NOW()),
  (gen_random_uuid(), 'masters.cruises.view_costing', 'masters.cruises', 'view_costing', 'View cruise room type prices', true, NOW()),
  (gen_random_uuid(), 'masters.cruises.manage_costing', 'masters.cruises', 'manage_costing', 'Edit cruise room type prices', true, NOW()),
  (gen_random_uuid(), 'masters.vehicles.view', 'masters.vehicles', 'view', 'View active vehicles', true, NOW()),
  (gen_random_uuid(), 'masters.vehicles.create', 'masters.vehicles', 'create', 'Create vehicles', true, NOW()),
  (gen_random_uuid(), 'masters.vehicles.update', 'masters.vehicles', 'update', 'Edit vehicles and change status', true, NOW()),
  (gen_random_uuid(), 'masters.vehicles.delete', 'masters.vehicles', 'delete', 'Archive vehicles', true, NOW()),
  (gen_random_uuid(), 'masters.vehicles.manage_media', 'masters.vehicles', 'manage_media', 'Manage vehicle images', true, NOW())
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description", "isAvailable" = true;

-- System roles. Owner/Manager get everything; the rest mirror their Phase 13B
-- grants, so nobody silently gains destructive or costing-management rights.
INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW() FROM "roles" r JOIN "permissions" p ON (
  r."name" IN ('Owner', 'Manager')
  OR (r."name" = 'Sales Executive' AND p."key" IN ('masters.cruises.view','masters.vehicles.view'))
  OR (r."name" = 'Data Entry' AND p."key" IN ('masters.cruises.view','masters.cruises.create','masters.cruises.update','masters.cruises.manage_media','masters.cruises.view_costing','masters.vehicles.view','masters.vehicles.create','masters.vehicles.update','masters.vehicles.manage_media'))
  OR (r."name" = 'View Only' AND p."key" IN ('masters.cruises.view','masters.vehicles.view'))
)
WHERE r."isSystem" = true AND p."module" IN ('masters.cruises','masters.vehicles') ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW() FROM "permission_templates" t JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN ('masters.cruises.view','masters.vehicles.view'))
  OR (t."name" = 'Data Entry' AND p."key" IN ('masters.cruises.view','masters.cruises.create','masters.cruises.update','masters.cruises.manage_media','masters.cruises.view_costing','masters.vehicles.view','masters.vehicles.create','masters.vehicles.update','masters.vehicles.manage_media'))
  OR (t."name" = 'View Only' AND p."key" IN ('masters.cruises.view','masters.vehicles.view'))
)
WHERE t."deletedAt" IS NULL AND t."name" IN ('Manager','Sales Executive','Data Entry','View Only')
  AND p."module" IN ('masters.cruises','masters.vehicles') ON CONFLICT DO NOTHING;
