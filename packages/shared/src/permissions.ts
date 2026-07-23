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
  REMINDERS: 'reminders',
  BOOKING_REMINDERS: 'booking_reminders',
  NOTIFICATIONS: 'notifications',
  QUOTATION_TEMPLATES: 'quotation_templates',
  QUOTATIONS: 'quotations',
  BOOKINGS: 'bookings',
  CUSTOMERS: 'customers',
  VENDORS: 'vendors',
  MASTERS: 'masters',
  MASTER_CITIES: 'masters.cities',
  MASTER_DESTINATIONS: 'masters.destinations',
  MASTER_HOTELS: 'masters.hotels',
  MASTER_AIRLINES: 'masters.airlines',
  MASTER_CRUISES: 'masters.cruises',
  MASTER_VEHICLES: 'masters.vehicles',
  MASTER_SIGHTSEEING: 'masters.sightseeing',
  MASTER_ADD_ON_SERVICES: 'masters.add_on_services',
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
  reminders: 'Reminders',
  booking_reminders: 'Booking Reminders',
  notifications: 'Notifications',
  quotation_templates: 'Quotation Templates',
  quotations: 'Quotations',
  bookings: 'Bookings',
  customers: 'Customers',
  vendors: 'Vendors',
  masters: 'Masters',
  'masters.cities': 'Masters — Cities',
  'masters.destinations': 'Masters — Destinations',
  'masters.hotels': 'Masters — Hotels',
  'masters.airlines': 'Masters — Airlines',
  'masters.cruises': 'Masters — Cruises',
  'masters.vehicles': 'Masters — Vehicles',
  'masters.sightseeing': 'Masters — Sightseeing',
  'masters.add_on_services': 'Masters — Add-On Services',
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
  available(M.QUERIES, 'view', 'View travel queries'),
  available(M.QUERIES, 'create', 'Create travel queries'),
  available(M.QUERIES, 'update', 'Edit travel queries'),
  available(M.QUERIES, 'delete', 'Delete travel queries'),
  available(M.QUERIES, 'assign', 'Assign travel queries to agents'),

  available(M.FOLLOWUPS, 'view', 'View follow-ups'),
  available(M.FOLLOWUPS, 'create', 'Create follow-ups'),
  available(M.FOLLOWUPS, 'update', 'Edit follow-ups'),
  available(M.FOLLOWUPS, 'delete', 'Delete follow-ups'),

  available(M.REMINDERS, 'view', 'View reminders'),
  available(M.REMINDERS, 'create', 'Create reminders'),
  available(M.REMINDERS, 'update', 'Edit reminders'),
  available(M.REMINDERS, 'delete', 'Delete reminders'),
  available(M.REMINDERS, 'complete', 'Complete reminders'),
  available(M.REMINDERS, 'snooze', 'Snooze reminders'),
  available(M.REMINDERS, 'reassign', 'Reassign reminders'),
  available(M.REMINDERS, 'view_all', 'View all company reminders'),
  available(M.REMINDERS, 'manage_rules', 'Manage reminder automation rules'),

  available(M.BOOKING_REMINDERS, 'view', 'View booking reminders'),
  available(M.BOOKING_REMINDERS, 'manage', 'Manage booking reminders'),

  available(M.NOTIFICATIONS, 'view', 'View personal notifications'),
  available(M.NOTIFICATIONS, 'manage', 'Manage personal notifications'),
  available(M.NOTIFICATIONS, 'settings', 'Manage notification preferences'),

  available(M.QUOTATION_TEMPLATES, 'view', 'View quotation templates'),
  available(M.QUOTATION_TEMPLATES, 'create', 'Create quotation templates'),
  available(M.QUOTATION_TEMPLATES, 'update', 'Edit quotation templates'),
  available(M.QUOTATION_TEMPLATES, 'delete', 'Archive quotation templates'),

  available(M.QUOTATIONS, 'view', 'View quotations'),
  available(M.QUOTATIONS, 'create', 'Create quotations'),
  available(M.QUOTATIONS, 'update', 'Edit quotations and create revisions'),
  available(M.QUOTATIONS, 'delete', 'Archive quotations'),
  available(M.QUOTATIONS, 'send', 'Send finalized quotations'),
  available(M.QUOTATIONS, 'accept', 'Accept or reject quotations internally'),
  available(M.QUOTATIONS, 'generate_pdf', 'Generate quotation PDFs'),
  available(M.QUOTATIONS, 'view_costing', 'View internal costs and margins'),

  available(M.BOOKINGS, 'view', 'View bookings'),
  available(M.BOOKINGS, 'create', 'Create manual bookings'),
  available(M.BOOKINGS, 'update', 'Edit booking operations'),
  available(M.BOOKINGS, 'delete', 'Archive bookings'),
  available(M.BOOKINGS, 'convert_from_quotation', 'Convert accepted quotations to bookings'),
  available(M.BOOKINGS, 'change_status', 'Change booking status'),
  available(M.BOOKINGS, 'manage_travellers', 'Manage booking travellers'),
  available(M.BOOKINGS, 'manage_documents', 'Manage booking documents'),
  available(M.BOOKINGS, 'view_sensitive_documents', 'View passport and identity documents'),
  available(M.BOOKINGS, 'view_financials', 'View booking revenue, costs and profit'),
  available(M.BOOKINGS, 'manage_payments', 'Manage customer payments'),
  available(M.BOOKINGS, 'manage_costs', 'Manage booking costs'),
  available(M.BOOKINGS, 'manage_refunds', 'Process and reverse customer refunds'),
  available(M.BOOKINGS, 'send_confirmation', 'Send booking confirmations and reminders'),
  available(M.BOOKINGS, 'export', 'Generate booking confirmation documents'),
  available(M.BOOKINGS, 'view_all', 'View all company bookings'),

  available(M.CUSTOMERS, 'view', 'View customers'),
  available(M.CUSTOMERS, 'create', 'Create customers'),
  available(M.CUSTOMERS, 'update', 'Edit customers'),
  available(M.CUSTOMERS, 'delete', 'Archive customers'),
  available(M.CUSTOMERS, 'merge', 'Preview and merge duplicate customers'),
  available(M.CUSTOMERS, 'manage_tags', 'Manage customer tags'),
  available(M.CUSTOMERS, 'manage_notes', 'Manage customer notes and communications'),
  available(M.CUSTOMERS, 'view_financials', 'View customer financial metrics'),
  available(M.CUSTOMERS, 'view_documents', 'View and manage customer documents'),
  available(M.CUSTOMERS, 'export', 'Export customer records'),
  available(M.CUSTOMERS, 'view_all', 'View all company customers'),

  available(M.VENDORS, 'view', 'View active vendors'),
  available(M.VENDORS, 'create', 'Create vendors'),
  available(M.VENDORS, 'update', 'Edit vendor profiles'),
  available(M.VENDORS, 'delete', 'Archive vendors'),
  available(M.VENDORS, 'view_all', 'View inactive and archived vendors'),
  available(M.VENDORS, 'manage_services', 'Manage vendor services and rates'),
  available(M.VENDORS, 'manage_contacts', 'Manage vendor contacts'),
  available(M.VENDORS, 'manage_documents', 'Manage vendor documents'),
  available(M.VENDORS, 'view_financials', 'View vendor costs and balances'),
  available(M.VENDORS, 'manage_payables', 'Manage vendor payables'),
  available(M.VENDORS, 'manage_payments', 'Record and reverse vendor payments'),
  available(M.VENDORS, 'view_bank_details', 'View full vendor bank details'),
  available(M.VENDORS, 'export', 'Export vendor records'),
  available(M.VENDORS, 'change_status', 'Activate, deactivate or archive vendors'),

  available(M.MASTERS, 'view', 'Open master-data modules'),
  available(M.MASTER_CITIES, 'view', 'View active cities'),
  available(M.MASTER_CITIES, 'create', 'Create cities'),
  available(M.MASTER_CITIES, 'update', 'Edit cities and change status'),
  available(M.MASTER_CITIES, 'delete', 'Archive cities'),
  available(M.MASTER_DESTINATIONS, 'view', 'View active destinations'),
  available(M.MASTER_DESTINATIONS, 'create', 'Create destinations'),
  available(M.MASTER_DESTINATIONS, 'update', 'Edit destinations and change status'),
  available(M.MASTER_DESTINATIONS, 'delete', 'Archive destinations'),
  available(M.MASTER_DESTINATIONS, 'manage_images', 'Manage destination images'),
  available(M.MASTER_HOTELS, 'view', 'View active hotels'),
  available(M.MASTER_HOTELS, 'create', 'Create hotels'),
  available(M.MASTER_HOTELS, 'update', 'Edit hotels and change status'),
  available(M.MASTER_HOTELS, 'delete', 'Archive hotels'),
  available(M.MASTER_HOTELS, 'manage_media', 'Manage hotel images'),
  available(M.MASTER_HOTELS, 'view_costing', 'View hotel room and meal plan costs'),
  available(M.MASTER_HOTELS, 'manage_costing', 'Edit hotel room and meal plan costs'),
  available(M.MASTER_AIRLINES, 'view', 'View active airlines'),
  available(M.MASTER_AIRLINES, 'create', 'Create airlines'),
  available(M.MASTER_AIRLINES, 'update', 'Edit airlines and change status'),
  available(M.MASTER_AIRLINES, 'delete', 'Archive airlines'),
  available(M.MASTER_AIRLINES, 'manage_media', 'Manage airline logos'),
  available(M.MASTER_CRUISES, 'view', 'View active cruises'),
  available(M.MASTER_CRUISES, 'create', 'Create cruises'),
  available(M.MASTER_CRUISES, 'update', 'Edit cruises and change status'),
  available(M.MASTER_CRUISES, 'delete', 'Archive cruises'),
  available(M.MASTER_CRUISES, 'manage_media', 'Manage cruise images'),
  available(M.MASTER_CRUISES, 'view_costing', 'View cruise room type prices'),
  available(M.MASTER_CRUISES, 'manage_costing', 'Edit cruise room type prices'),
  available(M.MASTER_VEHICLES, 'view', 'View active vehicles'),
  available(M.MASTER_VEHICLES, 'create', 'Create vehicles'),
  available(M.MASTER_VEHICLES, 'update', 'Edit vehicles and change status'),
  available(M.MASTER_VEHICLES, 'delete', 'Archive vehicles'),
  available(M.MASTER_VEHICLES, 'manage_media', 'Manage vehicle images'),
  available(M.MASTER_SIGHTSEEING, 'view', 'View active sightseeing'),
  available(M.MASTER_SIGHTSEEING, 'create', 'Create sightseeing'),
  available(M.MASTER_SIGHTSEEING, 'update', 'Edit sightseeing, reorder and change status'),
  available(M.MASTER_SIGHTSEEING, 'delete', 'Archive sightseeing'),
  available(M.MASTER_SIGHTSEEING, 'manage_media', 'Manage sightseeing images'),
  available(M.MASTER_ADD_ON_SERVICES, 'view', 'View active add-on services'),
  available(M.MASTER_ADD_ON_SERVICES, 'create', 'Create add-on services'),
  available(M.MASTER_ADD_ON_SERVICES, 'update', 'Edit add-on services and change status'),
  available(M.MASTER_ADD_ON_SERVICES, 'delete', 'Archive add-on services'),

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

  QUERIES_VIEW: 'queries.view',
  QUERIES_CREATE: 'queries.create',
  QUERIES_UPDATE: 'queries.update',
  QUERIES_DELETE: 'queries.delete',
  QUERIES_ASSIGN: 'queries.assign',

  FOLLOWUPS_VIEW: 'followups.view',
  FOLLOWUPS_CREATE: 'followups.create',
  FOLLOWUPS_UPDATE: 'followups.update',
  FOLLOWUPS_DELETE: 'followups.delete',

  REMINDERS_VIEW: 'reminders.view',
  REMINDERS_CREATE: 'reminders.create',
  REMINDERS_UPDATE: 'reminders.update',
  REMINDERS_DELETE: 'reminders.delete',
  REMINDERS_COMPLETE: 'reminders.complete',
  REMINDERS_SNOOZE: 'reminders.snooze',
  REMINDERS_REASSIGN: 'reminders.reassign',
  REMINDERS_VIEW_ALL: 'reminders.view_all',
  REMINDERS_MANAGE_RULES: 'reminders.manage_rules',

  BOOKING_REMINDERS_VIEW: 'booking_reminders.view',
  BOOKING_REMINDERS_MANAGE: 'booking_reminders.manage',

  NOTIFICATIONS_VIEW: 'notifications.view',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  NOTIFICATIONS_SETTINGS: 'notifications.settings',

  QUOTATION_TEMPLATES_VIEW: 'quotation_templates.view',
  QUOTATION_TEMPLATES_CREATE: 'quotation_templates.create',
  QUOTATION_TEMPLATES_UPDATE: 'quotation_templates.update',
  QUOTATION_TEMPLATES_DELETE: 'quotation_templates.delete',

  QUOTATIONS_VIEW: 'quotations.view',
  QUOTATIONS_CREATE: 'quotations.create',
  QUOTATIONS_UPDATE: 'quotations.update',
  QUOTATIONS_DELETE: 'quotations.delete',
  QUOTATIONS_SEND: 'quotations.send',
  QUOTATIONS_ACCEPT: 'quotations.accept',
  QUOTATIONS_GENERATE_PDF: 'quotations.generate_pdf',
  QUOTATIONS_VIEW_COSTING: 'quotations.view_costing',

  BOOKINGS_VIEW: 'bookings.view',
  BOOKINGS_CREATE: 'bookings.create',
  BOOKINGS_UPDATE: 'bookings.update',
  BOOKINGS_DELETE: 'bookings.delete',
  BOOKINGS_CONVERT_FROM_QUOTATION: 'bookings.convert_from_quotation',
  BOOKINGS_CHANGE_STATUS: 'bookings.change_status',
  BOOKINGS_MANAGE_TRAVELLERS: 'bookings.manage_travellers',
  BOOKINGS_MANAGE_DOCUMENTS: 'bookings.manage_documents',
  BOOKINGS_VIEW_SENSITIVE_DOCUMENTS: 'bookings.view_sensitive_documents',
  BOOKINGS_VIEW_FINANCIALS: 'bookings.view_financials',
  BOOKINGS_MANAGE_PAYMENTS: 'bookings.manage_payments',
  BOOKINGS_MANAGE_COSTS: 'bookings.manage_costs',
  BOOKINGS_MANAGE_REFUNDS: 'bookings.manage_refunds',
  BOOKINGS_SEND_CONFIRMATION: 'bookings.send_confirmation',
  BOOKINGS_EXPORT: 'bookings.export',
  BOOKINGS_VIEW_ALL: 'bookings.view_all',

  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_MERGE: 'customers.merge',
  CUSTOMERS_MANAGE_TAGS: 'customers.manage_tags',
  CUSTOMERS_MANAGE_NOTES: 'customers.manage_notes',
  CUSTOMERS_VIEW_FINANCIALS: 'customers.view_financials',
  CUSTOMERS_VIEW_DOCUMENTS: 'customers.view_documents',
  CUSTOMERS_EXPORT: 'customers.export',
  CUSTOMERS_VIEW_ALL: 'customers.view_all',

  VENDORS_VIEW: 'vendors.view',
  VENDORS_CREATE: 'vendors.create',
  VENDORS_UPDATE: 'vendors.update',
  VENDORS_DELETE: 'vendors.delete',
  VENDORS_VIEW_ALL: 'vendors.view_all',
  VENDORS_MANAGE_SERVICES: 'vendors.manage_services',
  VENDORS_MANAGE_CONTACTS: 'vendors.manage_contacts',
  VENDORS_MANAGE_DOCUMENTS: 'vendors.manage_documents',
  VENDORS_VIEW_FINANCIALS: 'vendors.view_financials',
  VENDORS_MANAGE_PAYABLES: 'vendors.manage_payables',
  VENDORS_MANAGE_PAYMENTS: 'vendors.manage_payments',
  VENDORS_VIEW_BANK_DETAILS: 'vendors.view_bank_details',
  VENDORS_EXPORT: 'vendors.export',
  VENDORS_CHANGE_STATUS: 'vendors.change_status',

  MASTERS_VIEW: 'masters.view',
  MASTER_CITIES_VIEW: 'masters.cities.view',
  MASTER_CITIES_CREATE: 'masters.cities.create',
  MASTER_CITIES_UPDATE: 'masters.cities.update',
  MASTER_CITIES_DELETE: 'masters.cities.delete',
  MASTER_DESTINATIONS_VIEW: 'masters.destinations.view',
  MASTER_DESTINATIONS_CREATE: 'masters.destinations.create',
  MASTER_DESTINATIONS_UPDATE: 'masters.destinations.update',
  MASTER_DESTINATIONS_DELETE: 'masters.destinations.delete',
  MASTER_DESTINATIONS_MANAGE_IMAGES: 'masters.destinations.manage_images',
  MASTER_HOTELS_VIEW: 'masters.hotels.view',
  MASTER_HOTELS_CREATE: 'masters.hotels.create',
  MASTER_HOTELS_UPDATE: 'masters.hotels.update',
  MASTER_HOTELS_DELETE: 'masters.hotels.delete',
  MASTER_HOTELS_MANAGE_MEDIA: 'masters.hotels.manage_media',
  MASTER_HOTELS_VIEW_COSTING: 'masters.hotels.view_costing',
  MASTER_HOTELS_MANAGE_COSTING: 'masters.hotels.manage_costing',
  MASTER_AIRLINES_VIEW: 'masters.airlines.view',
  MASTER_AIRLINES_CREATE: 'masters.airlines.create',
  MASTER_AIRLINES_UPDATE: 'masters.airlines.update',
  MASTER_AIRLINES_DELETE: 'masters.airlines.delete',
  MASTER_AIRLINES_MANAGE_MEDIA: 'masters.airlines.manage_media',
  MASTER_CRUISES_VIEW: 'masters.cruises.view',
  MASTER_CRUISES_CREATE: 'masters.cruises.create',
  MASTER_CRUISES_UPDATE: 'masters.cruises.update',
  MASTER_CRUISES_DELETE: 'masters.cruises.delete',
  MASTER_CRUISES_MANAGE_MEDIA: 'masters.cruises.manage_media',
  MASTER_CRUISES_VIEW_COSTING: 'masters.cruises.view_costing',
  MASTER_CRUISES_MANAGE_COSTING: 'masters.cruises.manage_costing',
  MASTER_VEHICLES_VIEW: 'masters.vehicles.view',
  MASTER_VEHICLES_CREATE: 'masters.vehicles.create',
  MASTER_VEHICLES_UPDATE: 'masters.vehicles.update',
  MASTER_VEHICLES_DELETE: 'masters.vehicles.delete',
  MASTER_VEHICLES_MANAGE_MEDIA: 'masters.vehicles.manage_media',
  MASTER_SIGHTSEEING_VIEW: 'masters.sightseeing.view',
  MASTER_SIGHTSEEING_CREATE: 'masters.sightseeing.create',
  MASTER_SIGHTSEEING_UPDATE: 'masters.sightseeing.update',
  MASTER_SIGHTSEEING_DELETE: 'masters.sightseeing.delete',
  MASTER_SIGHTSEEING_MANAGE_MEDIA: 'masters.sightseeing.manage_media',
  MASTER_ADD_ON_SERVICES_VIEW: 'masters.add_on_services.view',
  MASTER_ADD_ON_SERVICES_CREATE: 'masters.add_on_services.create',
  MASTER_ADD_ON_SERVICES_UPDATE: 'masters.add_on_services.update',
  MASTER_ADD_ON_SERVICES_DELETE: 'masters.add_on_services.delete',
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
