INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt") VALUES
  (gen_random_uuid(), 'masters.view', 'masters', 'view', 'Open master-data modules', true, NOW()),
  (gen_random_uuid(), 'masters.cities.view', 'masters.cities', 'view', 'View active cities', true, NOW()),
  (gen_random_uuid(), 'masters.cities.create', 'masters.cities', 'create', 'Create cities', true, NOW()),
  (gen_random_uuid(), 'masters.cities.update', 'masters.cities', 'update', 'Edit cities and change status', true, NOW()),
  (gen_random_uuid(), 'masters.cities.delete', 'masters.cities', 'delete', 'Archive cities', true, NOW()),
  (gen_random_uuid(), 'masters.destinations.view', 'masters.destinations', 'view', 'View active destinations', true, NOW()),
  (gen_random_uuid(), 'masters.destinations.create', 'masters.destinations', 'create', 'Create destinations', true, NOW()),
  (gen_random_uuid(), 'masters.destinations.update', 'masters.destinations', 'update', 'Edit destinations and change status', true, NOW()),
  (gen_random_uuid(), 'masters.destinations.delete', 'masters.destinations', 'delete', 'Archive destinations', true, NOW()),
  (gen_random_uuid(), 'masters.destinations.manage_images', 'masters.destinations', 'manage_images', 'Manage destination images', true, NOW())
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description", "isAvailable" = true;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW() FROM "roles" r JOIN "permissions" p ON (
  r."name" IN ('Owner', 'Manager')
  OR (r."name" = 'Sales Executive' AND p."key" IN ('masters.view','masters.cities.view','masters.destinations.view'))
  OR (r."name" = 'Data Entry' AND p."key" IN ('masters.view','masters.cities.view','masters.cities.create','masters.cities.update','masters.destinations.view','masters.destinations.create','masters.destinations.update','masters.destinations.manage_images'))
  OR (r."name" = 'View Only' AND p."key" IN ('masters.view','masters.cities.view','masters.destinations.view'))
)
WHERE r."isSystem" = true AND p."module" IN ('masters','masters.cities','masters.destinations') ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW() FROM "permission_templates" t JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN ('masters.view','masters.cities.view','masters.destinations.view'))
  OR (t."name" = 'Data Entry' AND p."key" IN ('masters.view','masters.cities.view','masters.cities.create','masters.cities.update','masters.destinations.view','masters.destinations.create','masters.destinations.update','masters.destinations.manage_images'))
  OR (t."name" = 'View Only' AND p."key" IN ('masters.view','masters.cities.view','masters.destinations.view'))
)
WHERE t."deletedAt" IS NULL AND t."name" IN ('Manager','Sales Executive','Data Entry','View Only')
  AND p."module" IN ('masters','masters.cities','masters.destinations') ON CONFLICT DO NOTHING;
