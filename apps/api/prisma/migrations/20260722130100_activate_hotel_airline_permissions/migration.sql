INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt") VALUES
  (gen_random_uuid(), 'masters.hotels.view', 'masters.hotels', 'view', 'View active hotels', true, NOW()),
  (gen_random_uuid(), 'masters.hotels.create', 'masters.hotels', 'create', 'Create hotels', true, NOW()),
  (gen_random_uuid(), 'masters.hotels.update', 'masters.hotels', 'update', 'Edit hotels and change status', true, NOW()),
  (gen_random_uuid(), 'masters.hotels.delete', 'masters.hotels', 'delete', 'Archive hotels', true, NOW()),
  (gen_random_uuid(), 'masters.hotels.manage_media', 'masters.hotels', 'manage_media', 'Manage hotel images', true, NOW()),
  (gen_random_uuid(), 'masters.hotels.view_costing', 'masters.hotels', 'view_costing', 'View hotel room and meal plan costs', true, NOW()),
  (gen_random_uuid(), 'masters.hotels.manage_costing', 'masters.hotels', 'manage_costing', 'Edit hotel room and meal plan costs', true, NOW()),
  (gen_random_uuid(), 'masters.airlines.view', 'masters.airlines', 'view', 'View active airlines', true, NOW()),
  (gen_random_uuid(), 'masters.airlines.create', 'masters.airlines', 'create', 'Create airlines', true, NOW()),
  (gen_random_uuid(), 'masters.airlines.update', 'masters.airlines', 'update', 'Edit airlines and change status', true, NOW()),
  (gen_random_uuid(), 'masters.airlines.delete', 'masters.airlines', 'delete', 'Archive airlines', true, NOW()),
  (gen_random_uuid(), 'masters.airlines.manage_media', 'masters.airlines', 'manage_media', 'Manage airline logos', true, NOW())
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description", "isAvailable" = true;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW() FROM "roles" r JOIN "permissions" p ON (
  r."name" IN ('Owner', 'Manager')
  OR (r."name" = 'Sales Executive' AND p."key" IN ('masters.hotels.view','masters.airlines.view'))
  OR (r."name" = 'Data Entry' AND p."key" IN ('masters.hotels.view','masters.hotels.create','masters.hotels.update','masters.hotels.manage_media','masters.airlines.view','masters.airlines.create','masters.airlines.update','masters.airlines.manage_media'))
  OR (r."name" = 'View Only' AND p."key" IN ('masters.hotels.view','masters.airlines.view'))
)
WHERE r."isSystem" = true AND p."module" IN ('masters.hotels','masters.airlines') ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW() FROM "permission_templates" t JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN ('masters.hotels.view','masters.airlines.view'))
  OR (t."name" = 'Data Entry' AND p."key" IN ('masters.hotels.view','masters.hotels.create','masters.hotels.update','masters.hotels.manage_media','masters.airlines.view','masters.airlines.create','masters.airlines.update','masters.airlines.manage_media'))
  OR (t."name" = 'View Only' AND p."key" IN ('masters.hotels.view','masters.airlines.view'))
)
WHERE t."deletedAt" IS NULL AND t."name" IN ('Manager','Sales Executive','Data Entry','View Only')
  AND p."module" IN ('masters.hotels','masters.airlines') ON CONFLICT DO NOTHING;
