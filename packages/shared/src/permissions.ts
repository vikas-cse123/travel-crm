/**
 * The permission catalogue — the single source of truth for both sides.
 *
 * A permission key is `<module>.<action>`. Keys for modules that are not built
 * yet are declared here with `isAvailable: false`: they are seeded into the
 * database so the UI can show them as planned, but they must never be granted
 * to a role or template until their module ships.
 */

export const PERMISSION_MODULE = {
  DASHBOARD: 'dashboard',
  USERS: 'users',
  ROLES: 'roles',
  PERMISSION_TEMPLATES: 'permission_templates',
  ACTIVITY_LOGS: 'activity_logs',
  SETTINGS: 'settings',
  QUERIES: 'queries',
  FOLLOWUPS: 'followups',
  QUOTATIONS: 'quotations',
  BOOKINGS: 'bookings',
  CUSTOMERS: 'customers',
  VENDORS: 'vendors',
  REPORTS: 'reports',
} as const;

export type PermissionModule = (typeof PERMISSION_MODULE)[keyof typeof PERMISSION_MODULE];

/** Human labels for module grouping in the permission picker. */
export const PERMISSION_MODULE_LABELS: Record<PermissionModule, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  roles: 'Roles',
  permission_templates: 'Permission Templates',
  activity_logs: 'Activity Logs',
  settings: 'Settings',
  queries: 'Travel Queries',
  followups: 'Follow-ups',
  quotations: 'Quotations',
  bookings: 'Bookings',
  customers: 'Customers',
  vendors: 'Vendors',
  reports: 'Reports',
};

export interface PermissionDefinition {
  key: string;
  module: PermissionModule;
  action: string;
  description: string;
  /** False for modules planned but not yet implemented. */
  isAvailable: boolean;
}

const available = (
  module: PermissionModule,
  action: string,
  description: string,
): PermissionDefinition => ({
  key: `${module}.${action}`,
  module,
  action,
  description,
  isAvailable: true,
});

const planned = (
  module: PermissionModule,
  action: string,
  description: string,
): PermissionDefinition => ({
  key: `${module}.${action}`,
  module,
  action,
  description,
  isAvailable: false,
});

const M = PERMISSION_MODULE;

/** Every permission the system knows about, available or planned. */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  // ---- Available today -------------------------------------------------
  available(M.DASHBOARD, 'view', 'View the dashboard'),

  available(M.USERS, 'view', 'View users and user details'),
  available(M.USERS, 'create', 'Create new users'),
  available(M.USERS, 'update', 'Edit user details'),
  available(M.USERS, 'archive', 'Archive users'),
  available(M.USERS, 'change_status', 'Activate, deactivate, suspend or restore users'),
  available(M.USERS, 'assign_role', 'Assign roles to users'),
  available(M.USERS, 'reset_password', 'Trigger a password reset for a user'),

  available(M.ROLES, 'view', 'View roles and their permissions'),
  available(M.ROLES, 'create', 'Create new roles'),
  available(M.ROLES, 'update', 'Edit roles and role permissions'),
  available(M.ROLES, 'delete', 'Delete non-system roles'),

  available(M.PERMISSION_TEMPLATES, 'view', 'View permission templates'),
  available(M.PERMISSION_TEMPLATES, 'create', 'Create permission templates'),
  available(M.PERMISSION_TEMPLATES, 'update', 'Edit permission templates'),
  available(M.PERMISSION_TEMPLATES, 'duplicate', 'Duplicate an existing template'),
  available(M.PERMISSION_TEMPLATES, 'change_status', 'Activate or deactivate templates'),
  available(M.PERMISSION_TEMPLATES, 'delete', 'Delete permission templates'),

  available(M.ACTIVITY_LOGS, 'view', 'View the company activity log'),

  available(M.SETTINGS, 'view', 'View company settings'),
  available(M.SETTINGS, 'update', 'Update company settings'),

  // ---- Planned: not grantable until the module ships -------------------
  planned(M.QUERIES, 'view', 'View travel queries'),
  planned(M.QUERIES, 'create', 'Create travel queries'),
  planned(M.QUERIES, 'update', 'Edit travel queries'),
  planned(M.QUERIES, 'delete', 'Delete travel queries'),
  planned(M.QUERIES, 'assign', 'Assign travel queries to agents'),

  planned(M.FOLLOWUPS, 'view', 'View follow-ups'),
  planned(M.FOLLOWUPS, 'create', 'Create follow-ups'),
  planned(M.FOLLOWUPS, 'update', 'Edit follow-ups'),
  planned(M.FOLLOWUPS, 'delete', 'Delete follow-ups'),

  planned(M.QUOTATIONS, 'view', 'View quotations'),
  planned(M.QUOTATIONS, 'create', 'Create quotations'),
  planned(M.QUOTATIONS, 'update', 'Edit quotations'),
  planned(M.QUOTATIONS, 'delete', 'Delete quotations'),

  planned(M.BOOKINGS, 'view', 'View bookings'),
  planned(M.BOOKINGS, 'create', 'Create bookings'),
  planned(M.BOOKINGS, 'update', 'Edit bookings'),
  planned(M.BOOKINGS, 'delete', 'Delete bookings'),

  planned(M.CUSTOMERS, 'view', 'View customers'),
  planned(M.CUSTOMERS, 'create', 'Create customers'),
  planned(M.CUSTOMERS, 'update', 'Edit customers'),
  planned(M.CUSTOMERS, 'delete', 'Delete customers'),

  planned(M.VENDORS, 'view', 'View vendors'),
  planned(M.VENDORS, 'create', 'Create vendors'),
  planned(M.VENDORS, 'update', 'Edit vendors'),
  planned(M.VENDORS, 'delete', 'Delete vendors'),

  planned(M.REPORTS, 'view', 'View reports'),
] as const;

/** Named constants for the permissions usable today. */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_ARCHIVE: 'users.archive',
  USERS_CHANGE_STATUS: 'users.change_status',
  USERS_ASSIGN_ROLE: 'users.assign_role',
  USERS_RESET_PASSWORD: 'users.reset_password',

  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',

  PERMISSION_TEMPLATES_VIEW: 'permission_templates.view',
  PERMISSION_TEMPLATES_CREATE: 'permission_templates.create',
  PERMISSION_TEMPLATES_UPDATE: 'permission_templates.update',
  PERMISSION_TEMPLATES_DUPLICATE: 'permission_templates.duplicate',
  PERMISSION_TEMPLATES_CHANGE_STATUS: 'permission_templates.change_status',
  PERMISSION_TEMPLATES_DELETE: 'permission_templates.delete',

  ACTIVITY_LOGS_VIEW: 'activity_logs.view',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Keys that may be granted right now. */
export const AVAILABLE_PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.filter(
  (permission) => permission.isAvailable,
).map((permission) => permission.key);

/** Keys reserved for future modules. Never grant these. */
export const PLANNED_PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.filter(
  (permission) => !permission.isAvailable,
).map((permission) => permission.key);

export function isAvailablePermission(key: string): boolean {
  return AVAILABLE_PERMISSION_KEYS.includes(key);
}

/** Group the catalogue by module for the permission picker UI. */
export function groupPermissionsByModule(): Array<{
  module: PermissionModule;
  label: string;
  permissions: PermissionDefinition[];
}> {
  const groups = new Map<PermissionModule, PermissionDefinition[]>();

  for (const permission of PERMISSION_CATALOG) {
    const existing = groups.get(permission.module);
    if (existing) {
      existing.push(permission);
    } else {
      groups.set(permission.module, [permission]);
    }
  }

  return Array.from(groups, ([module, permissions]) => ({
    module,
    label: PERMISSION_MODULE_LABELS[module],
    permissions,
  }));
}
