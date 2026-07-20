import { prisma } from '../../config/prisma.js';

/**
 * Effective permission resolution.
 *
 * THE RULE (one rule, deliberately — no deny/override semantics in this phase):
 *
 *   effective = (rolePermissions ∪ templatePermissions) ∩ availablePermissions
 *
 * Consequences, all intentional:
 *  - A permission template can only ADD permissions, never remove them. It is
 *    an additive convenience layer on top of a role, so attaching a template
 *    can never quietly strip an Owner's access.
 *  - A permission whose module is not built yet (`isAvailable = false`) can
 *    never become effective, even if a grant row exists for it. The
 *    availability filter is applied in the query, so this holds regardless of
 *    how the grant got there.
 *  - The union is order-independent, so there is no precedence to reason about.
 *
 * Richer semantics (explicit denies, template-overrides-role) are deliberately
 * out of scope: they are hard to reason about and easy to get wrong, and
 * nothing in the current product needs them.
 */
export const permissionsService = {
  /** Sorted, de-duplicated effective permission keys for a user. */
  async resolveForUser(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            permissions: {
              where: { permission: { isAvailable: true } },
              select: { permission: { select: { key: true } } },
            },
          },
        },
        permissionTemplate: {
          select: {
            status: true,
            deletedAt: true,
            permissions: {
              where: { permission: { isAvailable: true } },
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });

    if (!user) return [];

    const keys = new Set<string>();

    for (const entry of user.role.permissions) {
      keys.add(entry.permission.key);
    }

    // An inactive or soft-deleted template contributes nothing. The user keeps
    // their role permissions, so deactivating a template cannot lock anyone out.
    const template = user.permissionTemplate;
    if (template && template.status === 'ACTIVE' && template.deletedAt === null) {
      for (const entry of template.permissions) {
        keys.add(entry.permission.key);
      }
    }

    return [...keys].sort();
  },

  /** Whether a user holds a specific permission. */
  async userHasPermission(userId: string, permissionKey: string): Promise<boolean> {
    const keys = await this.resolveForUser(userId);
    return keys.includes(permissionKey);
  },
};
