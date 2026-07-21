INSERT INTO "permissions" ("id", "key", "module", "action", "description", "isAvailable", "createdAt") VALUES
  (gen_random_uuid(), 'reminders.view', 'reminders', 'view', 'View reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.create', 'reminders', 'create', 'Create reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.update', 'reminders', 'update', 'Edit reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.delete', 'reminders', 'delete', 'Delete reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.complete', 'reminders', 'complete', 'Complete reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.snooze', 'reminders', 'snooze', 'Snooze reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.reassign', 'reminders', 'reassign', 'Reassign reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.view_all', 'reminders', 'view_all', 'View all company reminders', true, NOW()),
  (gen_random_uuid(), 'reminders.manage_rules', 'reminders', 'manage_rules', 'Manage reminder automation rules', true, NOW()),
  (gen_random_uuid(), 'booking_reminders.view', 'booking_reminders', 'view', 'View booking reminders', true, NOW()),
  (gen_random_uuid(), 'booking_reminders.manage', 'booking_reminders', 'manage', 'Manage booking reminders', true, NOW()),
  (gen_random_uuid(), 'notifications.view', 'notifications', 'view', 'View personal notifications', true, NOW()),
  (gen_random_uuid(), 'notifications.manage', 'notifications', 'manage', 'Manage personal notifications', true, NOW()),
  (gen_random_uuid(), 'notifications.settings', 'notifications', 'settings', 'Manage notification preferences', true, NOW())
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description", "isAvailable" = true;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", NOW() FROM "roles" r JOIN "permissions" p ON (
  r."name" IN ('Owner', 'Manager')
  OR (r."name" = 'Sales Executive' AND p."key" IN ('reminders.view','reminders.create','reminders.update','reminders.complete','reminders.snooze','booking_reminders.view','booking_reminders.manage','notifications.view','notifications.manage','notifications.settings'))
  OR (r."name" = 'Data Entry' AND p."key" IN ('reminders.view','reminders.create','reminders.update','reminders.complete','reminders.snooze','booking_reminders.view','notifications.view','notifications.manage','notifications.settings'))
  OR (r."name" = 'View Only' AND p."key" IN ('reminders.view','booking_reminders.view','notifications.view'))
)
WHERE r."isSystem" = true AND p."module" IN ('reminders','booking_reminders','notifications') ON CONFLICT DO NOTHING;

INSERT INTO "permission_template_permissions" ("templateId", "permissionId", "createdAt")
SELECT t."id", p."id", NOW() FROM "permission_templates" t JOIN "permissions" p ON (
  t."name" = 'Manager'
  OR (t."name" = 'Sales Executive' AND p."key" IN ('reminders.view','reminders.create','reminders.update','reminders.complete','reminders.snooze','booking_reminders.view','booking_reminders.manage','notifications.view','notifications.manage','notifications.settings'))
  OR (t."name" = 'Data Entry' AND p."key" IN ('reminders.view','reminders.create','reminders.update','reminders.complete','reminders.snooze','booking_reminders.view','notifications.view','notifications.manage','notifications.settings'))
  OR (t."name" = 'View Only' AND p."key" IN ('reminders.view','booking_reminders.view','notifications.view'))
)
WHERE t."deletedAt" IS NULL AND t."name" IN ('Manager','Sales Executive','Data Entry','View Only')
  AND p."module" IN ('reminders','booking_reminders','notifications') ON CONFLICT DO NOTHING;
