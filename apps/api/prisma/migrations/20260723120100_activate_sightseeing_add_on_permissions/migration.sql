-- Phase 13D: register and grant the sightseeing / add-on-service permissions.
-- Mirrors the Phase 13B and 13C activation migrations. Idempotent.

INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt") VALUES
  (gen_random_uuid(), 'masters.sightseeing.view', 'masters.sightseeing', 'view', 'View active sightseeing', true, NOW()),
  (gen_random_uuid(), 'masters.sightseeing.create', 'masters.sightseeing', 'create', 'Create sightseeing', true, NOW()),
  (gen_random_uuid(), 'masters.sightseeing.update', 'masters.sightseeing', 'update', 'Edit sightseeing, reorder and change status', true, NOW()),
  (gen_random_uuid(), 'masters.sightseeing.delete', 'masters.sightseeing', 'delete', 'Archive sightseeing', true, NOW()),
  (gen_random_uuid(), 'masters.sightseeing.manage_media', 'masters.sightseeing', 'manage_media', 'Manage sightseeing images', true, NOW()),
  (gen_random_uuid(), 'masters.add_on_services.view', 'masters.add_on_services', 'view', 'View active add-on services', true, NOW()),
  (gen_random_uuid(), 'masters.add_on_services.create', 'masters.add_on_services', 'create', 'Create add-on services', true, NOW()),
  (gen_random_uuid(), 'masters.add_on_services.update', 'masters.add_on_services', 'update', 'Edit add-on services and change status', true, NOW()),
  (gen_random_uuid(), 'masters.add_on_services.delete', 'masters.add_on_services', 'delete', 'Archive add-on services', true, NOW())
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description", "isAvailable" = true;

-- Owner/Manager get everything; the rest mirror their Phase 13B/13C grants so
-- nobody silently gains archive rights.
INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW() FROM "roles" r JOIN "permissions" p ON (
  r."name" IN ('Owner', 'Manager')
  OR (r."name" = 'Sales Executive' AND p."key" IN ('masters.sightseeing.view','masters.add_on_services.view'))
  OR (r."name" = 'Data Entry' AND p."key" IN ('masters.sightseeing.view','masters.sightseeing.create','masters.sightseeing.update','masters.sightseeing.manage_media','masters.add_on_services.view','masters.add_on_services.create','masters.add_on_services.update'))
  OR (r."name" = 'View Only' AND p."key" IN ('masters.sightseeing.view','masters.add_on_services.view'))
)
WHERE r."isSystem" = true AND p."module" IN ('masters.sightseeing','masters.add_on_services') ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW() FROM "permission_templates" t JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN ('masters.sightseeing.view','masters.add_on_services.view'))
  OR (t."name" = 'Data Entry' AND p."key" IN ('masters.sightseeing.view','masters.sightseeing.create','masters.sightseeing.update','masters.sightseeing.manage_media','masters.add_on_services.view','masters.add_on_services.create','masters.add_on_services.update'))
  OR (t."name" = 'View Only' AND p."key" IN ('masters.sightseeing.view','masters.add_on_services.view'))
)
WHERE t."deletedAt" IS NULL AND t."name" IN ('Manager','Sales Executive','Data Entry','View Only')
  AND p."module" IN ('masters.sightseeing','masters.add_on_services') ON CONFLICT DO NOTHING;
