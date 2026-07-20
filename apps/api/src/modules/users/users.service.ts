import type { ActivityAction, Prisma, UserStatus } from '@prisma/client';
import {
  ACTIVITY_ACTION,
  ENTITY_TYPE,
  type CreateUserInput,
  type UpdateUserInput,
} from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors.js';
import { generateSecureToken, hashPassword, hashToken } from '../../utils/crypto.js';
import { normalizeEmail, normalizeUsername } from '../../utils/normalize.js';
import { resolvePagination } from '../../utils/pagination.js';
import { permissionsService } from '../auth/permissions.service.js';
import { rolesRepository } from '../roles/roles.repository.js';
import { permissionTemplatesRepository } from '../permission-templates/permission-templates.repository.js';
import { usersRepository, type UserSortField } from './users.repository.js';
import { emailService, sendEmailSafely } from '../../services/email/email.service.js';

export interface UserRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

async function caller(auth: AuthContext) {
  const value = await prisma.user.findFirst({
    where: { id: auth.userId, companyId: auth.companyId, deletedAt: null },
    select: { id: true, role: { select: { id: true, name: true, hierarchyLevel: true } } },
  });
  if (!value) throw new ForbiddenError();
  return value;
}

async function targetOr404(auth: AuthContext, id: string, includeDeleted = false) {
  const value = await prisma.user.findFirst({
    where: { id, companyId: auth.companyId, ...(includeDeleted ? {} : { deletedAt: null }) },
    select: {
      id: true,
      companyId: true,
      roleId: true,
      status: true,
      deletedAt: true,
      email: true,
      fullName: true,
      username: true,
      role: { select: { id: true, name: true, hierarchyLevel: true } },
    },
  });
  if (!value) throw new NotFoundError('User not found.');
  return value;
}

function assertCanModify(
  c: Awaited<ReturnType<typeof caller>>,
  target: Awaited<ReturnType<typeof targetOr404>>,
) {
  if (target.role.hierarchyLevel === 100 && c.role.hierarchyLevel !== 100)
    throw new ForbiddenError('Only an Owner may modify an Owner.');
}

function assertCanAssign(
  c: Awaited<ReturnType<typeof caller>>,
  targetId: string,
  role: { hierarchyLevel: number; name: string },
) {
  if (targetId === c.id) throw new ForbiddenError('You cannot change your own role.');
  if (c.role.hierarchyLevel !== 100 && role.hierarchyLevel >= c.role.hierarchyLevel)
    throw new ForbiddenError('You cannot assign this role.');
  if (role.hierarchyLevel === 100 && c.role.hierarchyLevel !== 100)
    throw new ForbiddenError('Only an Owner may assign the Owner role.');
}

async function assertNotFinalActiveOwner(
  auth: AuthContext,
  target: Awaited<ReturnType<typeof targetOr404>>,
) {
  if (target.role.hierarchyLevel === 100 && target.status === 'ACTIVE') {
    const count = await usersRepository.countActiveOwners(auth.tenant, target.roleId);
    if (count <= 1) throw new ForbiddenError('The final active Owner is protected.');
  }
}

function auditData(
  auth: AuthContext,
  targetId: string,
  action: ActivityAction,
  context: UserRequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogCreateInput {
  return {
    company: { connect: { id: auth.companyId } },
    actorUser: { connect: { id: auth.userId } },
    targetUser: { connect: { id: targetId } },
    action,
    entityType: ENTITY_TYPE.USER,
    entityId: targetId,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  };
}

export const usersService = {
  async list(
    auth: AuthContext,
    query: {
      page?: number;
      pageSize?: number;
      search?: string;
      roleId?: string;
      status?: UserStatus;
      sortBy?: UserSortField;
      sortOrder?: Prisma.SortOrder;
      createdFrom?: Date;
      createdTo?: Date;
    },
  ) {
    return usersRepository.list(auth.tenant, query, resolvePagination(query), {
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    });
  },

  async details(auth: AuthContext, id: string) {
    const user = await usersRepository.findById(auth.tenant, id);
    if (!user) throw new NotFoundError('User not found.');
    const effectivePermissions = await permissionsService.resolveForUser(id);
    const recentActivity = await prisma.activityLog.findMany({
      where: {
        companyId: auth.companyId,
        OR: [
          { actorUserId: id },
          { targetUserId: id },
          { entityType: ENTITY_TYPE.USER, entityId: id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, action: true, createdAt: true },
    });
    return {
      ...user,
      emailVerified: user.emailVerifiedAt !== null,
      effectivePermissions,
      recentActivity,
    };
  },

  async lookups(auth: AuthContext) {
    const c = await caller(auth);
    const [roles, templates] = await Promise.all([
      rolesRepository.list(auth.tenant),
      permissionTemplatesRepository.list(auth.tenant, 'ACTIVE'),
    ]);
    return {
      roles: roles
        .filter((r) => c.role.hierarchyLevel === 100 || r.hierarchyLevel < c.role.hierarchyLevel)
        .map(({ id, name, hierarchyLevel }) => ({ id, name, hierarchyLevel })),
      permissionTemplates: templates.map(({ id, name }) => ({ id, name })),
    };
  },

  async create(auth: AuthContext, input: CreateUserInput, context: UserRequestContext) {
    const c = await caller(auth);
    const role = await rolesRepository.findById(auth.tenant, input.roleId);
    if (!role)
      throw new ValidationError('Role does not belong to this company.', {
        roleId: ['Select a valid role'],
      });
    assertCanAssign(c, '', role);
    if (
      input.permissionTemplateId &&
      !(await permissionTemplatesRepository.findById(auth.tenant, input.permissionTemplateId))
    )
      throw new ValidationError('Permission template does not belong to this company.', {
        permissionTemplateId: ['Select a valid template'],
      });
    if (await usersRepository.isEmailTaken(input.email))
      throw new ConflictError('An account with this email already exists.');
    if (await usersRepository.isUsernameTaken(auth.tenant, input.username))
      throw new ConflictError('This username is already in use.');
    const passwordHash = await hashPassword(input.temporaryPassword);
    try {
      const userId = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            companyId: auth.companyId,
            roleId: role.id,
            permissionTemplateId: input.permissionTemplateId ?? null,
            fullName: input.fullName,
            username: normalizeUsername(input.username),
            email: input.email,
            normalizedEmail: normalizeEmail(input.email),
            phone: input.phone ?? null,
            passwordHash,
            status: input.status,
            emailVerifiedAt: new Date(),
            mustChangePassword: input.mustChangePassword,
          },
          select: { id: true },
        });
        await tx.activityLog.create({
          data: auditData(auth, user.id, ACTIVITY_ACTION.USER_CREATED, context, {
            roleId: role.id,
            status: input.status,
          }),
        });
        return user.id;
      });
      return this.details(auth, userId);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictError('Email or username is already in use.');
      throw error;
    }
  },

  async update(auth: AuthContext, id: string, input: UpdateUserInput, context: UserRequestContext) {
    const [c, target] = await Promise.all([caller(auth), targetOr404(auth, id)]);
    assertCanModify(c, target);
    const changedFields = Object.keys(input).filter(
      (key) => input[key as keyof UpdateUserInput] !== undefined,
    );
    let roleChanged = false;
    if (input.roleId !== undefined && input.roleId !== target.roleId) {
      const canAssign = await permissionsService.userHasPermission(
        auth.userId,
        'users.assign_role',
      );
      if (!canAssign) throw new ForbiddenError('Assigning a role requires users.assign_role.');
      const role = await rolesRepository.findById(auth.tenant, input.roleId);
      if (!role) throw new ValidationError('Role does not belong to this company.');
      assertCanAssign(c, id, role);
      await assertNotFinalActiveOwner(auth, target);
      roleChanged = true;
    }
    if (input.permissionTemplateId !== undefined) {
      if (!(await permissionsService.userHasPermission(auth.userId, 'users.assign_role')))
        throw new ForbiddenError('Assigning a permission template requires users.assign_role.');
      if (
        input.permissionTemplateId &&
        !(await permissionTemplatesRepository.findById(auth.tenant, input.permissionTemplateId))
      )
        throw new ValidationError('Permission template does not belong to this company.');
    }
    if (input.email && (await usersRepository.isEmailTaken(input.email, id)))
      throw new ConflictError('An account with this email already exists.');
    if (input.username && (await usersRepository.isUsernameTaken(auth.tenant, input.username, id)))
      throw new ConflictError('This username is already in use.');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.username !== undefined ? { username: normalizeUsername(input.username) } : {}),
          ...(input.email !== undefined
            ? { email: input.email, normalizedEmail: normalizeEmail(input.email) }
            : {}),
          ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
          ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
          ...(input.permissionTemplateId !== undefined
            ? { permissionTemplateId: input.permissionTemplateId }
            : {}),
          ...(input.mustChangePassword !== undefined
            ? { mustChangePassword: input.mustChangePassword }
            : {}),
        },
      });
      await tx.activityLog.create({
        data: auditData(auth, id, ACTIVITY_ACTION.USER_UPDATED, context, { changedFields }),
      });
      if (roleChanged) {
        await tx.activityLog.create({
          data: auditData(auth, id, ACTIVITY_ACTION.USER_ROLE_CHANGED, context, {
            previousRoleId: target.roleId,
            newRoleId: input.roleId,
          }),
        });
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
    return this.details(auth, id);
  },

  async changeStatus(
    auth: AuthContext,
    id: string,
    status: UserStatus,
    reason: string | undefined,
    context: UserRequestContext,
  ) {
    const [c, target] = await Promise.all([caller(auth), targetOr404(auth, id, true)]);
    assertCanModify(c, target);
    if (id === auth.userId && status !== 'ACTIVE')
      throw new ForbiddenError('You cannot deactivate, suspend or archive yourself.');
    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status))
      throw new ValidationError('Unsupported status transition.');
    const restoring = target.deletedAt !== null && status === 'ACTIVE';
    if (target.deletedAt !== null && !restoring)
      throw new ValidationError('Archived users may only be restored to ACTIVE.');
    if (!restoring && target.status === status) return this.details(auth, id);
    if (status !== 'ACTIVE') await assertNotFinalActiveOwner(auth, target);
    const action = restoring
      ? ACTIVITY_ACTION.USER_RESTORED
      : status === 'ACTIVE'
        ? ACTIVITY_ACTION.USER_ACTIVATED
        : status === 'INACTIVE'
          ? ACTIVITY_ACTION.USER_DEACTIVATED
          : ACTIVITY_ACTION.USER_SUSPENDED;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status, ...(restoring ? { deletedAt: null } : {}) },
      });
      if (status !== 'ACTIVE')
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.activityLog.create({
        data: auditData(auth, id, action, context, {
          previousStatus: target.status,
          newStatus: status,
          ...(reason ? { reason } : {}),
        }),
      });
    });
    return this.details(auth, id);
  },

  async archive(auth: AuthContext, id: string, context: UserRequestContext) {
    const [c, target] = await Promise.all([caller(auth), targetOr404(auth, id, true)]);
    if (target.deletedAt !== null) return { archived: true, id };
    assertCanModify(c, target);
    if (id === auth.userId) throw new ForbiddenError('You cannot archive yourself.');
    await assertNotFinalActiveOwner(auth, target);
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.user.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: now } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.emailVerificationOtp.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.activityLog.create({
        data: auditData(auth, id, ACTIVITY_ACTION.USER_ARCHIVED, context, {
          previousStatus: target.status,
        }),
      });
    });
    return { archived: true, id };
  },

  async sendPasswordReset(auth: AuthContext, id: string, context: UserRequestContext) {
    const target = await targetOr404(auth, id);
    const rawToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_EXPIRY_MINUTES * 60_000);
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: { userId: id, tokenHash: hashToken(rawToken), expiresAt },
      });
      await tx.activityLog.create({
        data: auditData(auth, id, ACTIVITY_ACTION.USER_PASSWORD_RESET, context, {
          expiresAt: expiresAt.toISOString(),
        }),
      });
    });
    await sendEmailSafely(
      () =>
        emailService.sendPasswordResetEmail({
          to: target.email,
          fullName: target.fullName,
          resetUrl: `${env.WEB_URL}/reset-password/${rawToken}`,
          expiryMinutes: env.PASSWORD_RESET_EXPIRY_MINUTES,
        }),
      { action: 'admin-password-reset', to: target.email },
    );
    return { requested: true };
  },

  async activity(
    auth: AuthContext,
    id: string,
    query: {
      page?: number;
      pageSize?: number;
      action?: ActivityAction;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    await targetOr404(auth, id, true);
    const pagination = resolvePagination(query);
    const where: Prisma.ActivityLogWhereInput = {
      companyId: auth.companyId,
      OR: [
        { actorUserId: id },
        { targetUserId: id },
        { entityType: ENTITY_TYPE.USER, entityId: id },
      ],
      ...(query.action ? { action: query.action } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          actorUser: { select: { id: true, fullName: true } },
          targetUser: { select: { id: true, fullName: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);
    return {
      data: data.map((e) => ({ ...e, metadata: sanitizeMetadata(e.metadata) })),
      pagination: {
        ...pagination,
        total,
        totalPages: total ? Math.ceil(total / pagination.pageSize) : 0,
      },
    };
  },
};

function sanitizeMetadata(value: Prisma.JsonValue | undefined): Prisma.JsonValue {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !/(password|token|otp|cookie|secret|hash)/i.test(k))
        .map(([k, v]) => [k, sanitizeMetadata(v)]),
    );
  return value;
}
