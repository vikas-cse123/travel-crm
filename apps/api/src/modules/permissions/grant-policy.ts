import { AVAILABLE_PERMISSION_KEYS, PERMISSIONS, ROLE_NAME } from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { ForbiddenError, ValidationError } from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';

export const SENSITIVE_PERMISSIONS: ReadonlySet<string> = new Set([
  PERMISSIONS.ROLES_CREATE,
  PERMISSIONS.ROLES_UPDATE,
  PERMISSIONS.ROLES_DELETE,
  PERMISSIONS.USERS_ASSIGN_ROLE,
  PERMISSIONS.PERMISSION_TEMPLATES_CREATE,
  PERMISSIONS.PERMISSION_TEMPLATES_UPDATE,
  PERMISSIONS.PERMISSION_TEMPLATES_DELETE,
  PERMISSIONS.SETTINGS_UPDATE,
]);

export async function administrationCaller(auth: AuthContext) {
  const user = await prisma.user.findFirst({
    where: { id: auth.userId, companyId: auth.companyId, deletedAt: null },
    select: { id: true, role: { select: { name: true, hierarchyLevel: true } } },
  });
  if (!user) throw new ForbiddenError();
  return user;
}

export async function assertGrantable(auth: AuthContext, keys: readonly string[]) {
  const unique = [...new Set(keys)];
  if (unique.some((key) => !AVAILABLE_PERMISSION_KEYS.includes(key)))
    throw new ValidationError('One or more permissions are unavailable.');
  const caller = await administrationCaller(auth);
  if (caller.role.name === ROLE_NAME.OWNER) return unique;
  if (unique.some((key) => SENSITIVE_PERMISSIONS.has(key)))
    throw new ForbiddenError('Only an Owner may grant sensitive administration permissions.');
  const owned = new Set(await permissionsService.resolveForUser(auth.userId));
  if (unique.some((key) => !owned.has(key)))
    throw new ForbiddenError('You cannot grant permissions you do not possess.');
  return unique;
}
