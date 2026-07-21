import { PERMISSIONS } from './permissions.js';

/**
 * The five roles every company is created with.
 *
 * `hierarchyLevel` orders privilege: a user may only assign a role at or below
 * their own level, which is what stops a Manager from creating an Owner.
 */

export const ROLE_NAME = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  SALES_EXECUTIVE: 'Sales Executive',
  DATA_ENTRY: 'Data Entry',
  VIEW_ONLY: 'View Only',
} as const;

export type RoleName = (typeof ROLE_NAME)[keyof typeof ROLE_NAME];

export const ROLE_HIERARCHY = {
  [ROLE_NAME.OWNER]: 100,
  [ROLE_NAME.MANAGER]: 80,
  [ROLE_NAME.SALES_EXECUTIVE]: 50,
  [ROLE_NAME.DATA_ENTRY]: 40,
  [ROLE_NAME.VIEW_ONLY]: 10,
} as const satisfies Record<RoleName, number>;

export interface DefaultRoleDefinition {
  name: RoleName;
  description: string;
  hierarchyLevel: number;
  /** System roles are protected from deletion. */
  isSystem: boolean;
  /**
   * Permission keys granted by default. `null` means "every currently
   * available permission" — used by Owner so new permissions are picked up
   * automatically as modules ship.
   */
  permissionKeys: readonly string[] | null;
}

export const DEFAULT_ROLES: readonly DefaultRoleDefinition[] = [
  {
    name: ROLE_NAME.OWNER,
    description: 'Full access to every feature and setting. Cannot be deleted.',
    hierarchyLevel: ROLE_HIERARCHY[ROLE_NAME.OWNER],
    isSystem: true,
    permissionKeys: null,
  },
  {
    name: ROLE_NAME.MANAGER,
    description: 'Manages the team, users and day-to-day operations.',
    hierarchyLevel: ROLE_HIERARCHY[ROLE_NAME.MANAGER],
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_CHANGE_STATUS,
      PERMISSIONS.USERS_ASSIGN_ROLE,
      PERMISSIONS.ROLES_VIEW,
      PERMISSIONS.PERMISSION_TEMPLATES_VIEW,
      PERMISSIONS.ACTIVITY_LOGS_VIEW,
      PERMISSIONS.SETTINGS_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.QUERIES_CREATE,
      PERMISSIONS.QUERIES_UPDATE,
      PERMISSIONS.QUERIES_DELETE,
      PERMISSIONS.QUERIES_ASSIGN,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.FOLLOWUPS_CREATE,
      PERMISSIONS.FOLLOWUPS_UPDATE,
      PERMISSIONS.FOLLOWUPS_DELETE,
      PERMISSIONS.QUOTATION_TEMPLATES_VIEW,
      PERMISSIONS.QUOTATION_TEMPLATES_CREATE,
      PERMISSIONS.QUOTATION_TEMPLATES_UPDATE,
      PERMISSIONS.QUOTATION_TEMPLATES_DELETE,
      PERMISSIONS.QUOTATIONS_VIEW,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.QUOTATIONS_UPDATE,
      PERMISSIONS.QUOTATIONS_DELETE,
      PERMISSIONS.QUOTATIONS_SEND,
      PERMISSIONS.QUOTATIONS_ACCEPT,
      PERMISSIONS.QUOTATIONS_GENERATE_PDF,
      PERMISSIONS.QUOTATIONS_VIEW_COSTING,
    ],
  },
  {
    name: ROLE_NAME.SALES_EXECUTIVE,
    description: 'Handles travel queries and quotations. Gains more access as modules ship.',
    hierarchyLevel: ROLE_HIERARCHY[ROLE_NAME.SALES_EXECUTIVE],
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.QUERIES_CREATE,
      PERMISSIONS.QUERIES_UPDATE,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.FOLLOWUPS_CREATE,
      PERMISSIONS.FOLLOWUPS_UPDATE,
      PERMISSIONS.QUOTATIONS_VIEW,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.QUOTATIONS_UPDATE,
      PERMISSIONS.QUOTATIONS_SEND,
      PERMISSIONS.QUOTATIONS_GENERATE_PDF,
    ],
  },
  {
    name: ROLE_NAME.DATA_ENTRY,
    description: 'Maintains master data. No destructive permissions.',
    hierarchyLevel: ROLE_HIERARCHY[ROLE_NAME.DATA_ENTRY],
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.QUERIES_CREATE,
      PERMISSIONS.QUERIES_UPDATE,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.FOLLOWUPS_CREATE,
      PERMISSIONS.FOLLOWUPS_UPDATE,
      PERMISSIONS.QUOTATION_TEMPLATES_VIEW,
      PERMISSIONS.QUOTATIONS_VIEW,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.QUOTATIONS_UPDATE,
    ],
  },
  {
    name: ROLE_NAME.VIEW_ONLY,
    description: 'Read-only access.',
    hierarchyLevel: ROLE_HIERARCHY[ROLE_NAME.VIEW_ONLY],
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.QUOTATIONS_VIEW,
    ],
  },
] as const;

/**
 * The quick-setup permission templates offered when creating a template.
 * Deliberately mirrors the non-Owner roles.
 */
export const DEFAULT_PERMISSION_TEMPLATES: readonly {
  name: string;
  description: string;
  permissionKeys: readonly string[];
}[] = [
  {
    name: 'Manager',
    description: 'Access to core functions and team data visibility.',
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_CHANGE_STATUS,
      PERMISSIONS.ROLES_VIEW,
      PERMISSIONS.PERMISSION_TEMPLATES_VIEW,
      PERMISSIONS.ACTIVITY_LOGS_VIEW,
      PERMISSIONS.SETTINGS_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.QUERIES_CREATE,
      PERMISSIONS.QUERIES_UPDATE,
      PERMISSIONS.QUERIES_DELETE,
      PERMISSIONS.QUERIES_ASSIGN,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.FOLLOWUPS_CREATE,
      PERMISSIONS.FOLLOWUPS_UPDATE,
      PERMISSIONS.FOLLOWUPS_DELETE,
      PERMISSIONS.QUOTATION_TEMPLATES_VIEW,
      PERMISSIONS.QUOTATION_TEMPLATES_CREATE,
      PERMISSIONS.QUOTATION_TEMPLATES_UPDATE,
      PERMISSIONS.QUOTATION_TEMPLATES_DELETE,
      PERMISSIONS.QUOTATIONS_VIEW,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.QUOTATIONS_UPDATE,
      PERMISSIONS.QUOTATIONS_DELETE,
      PERMISSIONS.QUOTATIONS_SEND,
      PERMISSIONS.QUOTATIONS_ACCEPT,
      PERMISSIONS.QUOTATIONS_GENERATE_PDF,
      PERMISSIONS.QUOTATIONS_VIEW_COSTING,
    ],
  },
  {
    name: 'Sales Executive',
    description: 'Full lead management and quotation creation, own data only.',
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.QUERIES_CREATE,
      PERMISSIONS.QUERIES_UPDATE,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.FOLLOWUPS_CREATE,
      PERMISSIONS.FOLLOWUPS_UPDATE,
      PERMISSIONS.QUOTATIONS_VIEW,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.QUOTATIONS_UPDATE,
      PERMISSIONS.QUOTATIONS_SEND,
      PERMISSIONS.QUOTATIONS_GENERATE_PDF,
    ],
  },
  {
    name: 'Data Entry',
    description: 'Master data management only, no destructive operations.',
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.QUERIES_CREATE,
      PERMISSIONS.QUERIES_UPDATE,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.FOLLOWUPS_CREATE,
      PERMISSIONS.FOLLOWUPS_UPDATE,
      PERMISSIONS.QUOTATION_TEMPLATES_VIEW,
      PERMISSIONS.QUOTATIONS_VIEW,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.QUOTATIONS_UPDATE,
    ],
  },
  {
    name: 'View Only',
    description: 'Read-only access to available modules.',
    permissionKeys: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.FOLLOWUPS_VIEW,
      PERMISSIONS.QUOTATIONS_VIEW,
    ],
  },
] as const;
