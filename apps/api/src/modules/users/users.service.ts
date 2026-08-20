import type { ActivityAction, Prisma, UserStatus, UserGender } from '@prisma/client';
import {
  ACTIVITY_ACTION,
  ENTITY_TYPE,
  type CreateUserInput,
  type UpdateUserInput,
} from '@interscale/shared';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { storageService, userProfileImageObjectKey } from '../../services/storage/storage.service.js';
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

async function userProfileImageUrl(user: {
  profileImageObjectKey: string | null;
  profileImageConfirmedAt: Date | null;
}): Promise<string | null> {
  if (!user.profileImageObjectKey || !user.profileImageConfirmedAt) return null;
  try {
    return await storageService.createDownloadUrl(
      user.profileImageObjectKey,
      'profile-image',
      env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS,
    );
  } catch {
    return null;
  }
}

async function presentUser<T extends { profileImageObjectKey: string | null; profileImageConfirmedAt: Date | null }>(
  user: T,
): Promise<T & { profileImageUrl: string | null }> {
  const url = await userProfileImageUrl(user);
  return { ...user, profileImageUrl: url };
}

const PROFILE_IMAGE_MAX_MB = 5;
const PROFILE_PRESIGN_TTL = 600;

function profileImageKey(companyId: string, userId: string, fileName: string) {
  return userProfileImageObjectKey({
    companyId,
    userId,
    imageId: randomUUID(),
    fileName,
  });
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
    const result = await usersRepository.list(auth.tenant, query, resolvePagination(query), {
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    });
    const data = await Promise.all(result.data.map((u) => presentUser(u)));
    return { ...result, data };
  },

  async details(auth: AuthContext, id: string) {
    const user = await usersRepository.findById(auth.tenant, id);
    if (!user) throw new NotFoundError('User not found.');
    const presented = await presentUser(user);
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
      ...presented,
      emailVerified: presented.emailVerifiedAt !== null,
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
            gender: (input.gender as unknown as UserGender) ?? null,
            jobTitle: input.jobTitle ?? null,
            bio: input.bio ?? null,
            specialization: input.specialization ?? null,
            yearsOfExperience: input.yearsOfExperience ?? null,
            tripsPlanned: input.tripsPlanned ?? null,
            languages: input.languages ?? null,
            whatsappNumber: input.whatsappNumber ?? null,
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
          ...(input.gender !== undefined ? { gender: (input.gender as unknown as UserGender) ?? null } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle ?? null } : {}),
          ...(input.bio !== undefined ? { bio: input.bio ?? null } : {}),
          ...(input.specialization !== undefined ? { specialization: input.specialization ?? null } : {}),
          ...(input.yearsOfExperience !== undefined ? { yearsOfExperience: input.yearsOfExperience ?? null } : {}),
          ...(input.tripsPlanned !== undefined ? { tripsPlanned: input.tripsPlanned ?? null } : {}),
          ...(input.languages !== undefined ? { languages: input.languages ?? null } : {}),
          ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber ?? null } : {}),
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

  /**
   * Owner-only administrative password set for another same-company user.
   *
   * The caller must hold Owner authority, must not target themselves (the Owner
   * uses the normal change-password flow), and the target must belong to the
   * caller's tenant. The old password is never required or accepted. After the
   * update every existing session of the target user is revoked so old sessions
   * are signed out; the Owner's own session is untouched.
   */
  async setPassword(auth: AuthContext, id: string, password: string, context: UserRequestContext) {
    const [c, target] = await Promise.all([caller(auth), targetOr404(auth, id)]);
    // Owner authority only — not merely a permission grant.
    if (c.role.hierarchyLevel !== 100)
      throw new ForbiddenError("Only an Owner may set another user's password.");
    if (id === auth.userId)
      throw new ForbiddenError('Use your own change-password flow for your account.');
    // Preserve existing Owner protection rules (e.g. an Owner cannot be
    // modified by anyone without Owner authority — already true here — and the
    // final active Owner is protected from destructive changes).
    assertCanModify(c, target);
    await assertNotFinalActiveOwner(auth, target);

    const passwordHash = await hashPassword(password);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          // Clear brute-force state, matching the reset-password behaviour.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      // Sign out every session the target user holds; the Owner's own session
      // belongs to a different user and is unaffected.
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.activityLog.create({
        data: auditData(auth, id, ACTIVITY_ACTION.USER_PASSWORD_RESET, context, {
          performedBy: 'OWNER',
          // Never any password/hash/token data.
        }),
      });
    });
    return { updated: true };
  },

  async prepareProfileImageUpload(
    auth: AuthContext,
    userId: string,
    input: { fileName: string; mimeType: string; fileSize: number },
    _context: UserRequestContext,
  ) {
    const target = await targetOr404(auth, userId);
    assertCanModify(await caller(auth), target);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(input.mimeType))
      throw new ValidationError('Profile photo must be JPEG, PNG or WebP.');
    const max = PROFILE_IMAGE_MAX_MB * 1024 * 1024;
    if (input.fileSize > max) throw new ValidationError(`Profile photo must be ${PROFILE_IMAGE_MAX_MB} MB or smaller.`);
    const key = profileImageKey(auth.companyId, userId, input.fileName);
    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pendingProfileImageObjectKey: true },
    });
    if (existing.pendingProfileImageObjectKey) {
      try {
        await storageService.deleteObject(existing.pendingProfileImageObjectKey);
      } catch {}
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        pendingProfileImageObjectKey: key,
        pendingProfileImageFileName: input.fileName,
        pendingProfileImageMimeType: input.mimeType,
        pendingProfileImageFileSize: input.fileSize,
      },
    });
    const uploadUrl = await storageService.createUploadUrl(key, input.mimeType, input.fileSize, PROFILE_PRESIGN_TTL);
    return { uploadUrl, key, expiresInSeconds: PROFILE_PRESIGN_TTL };
  },

  async confirmProfileImage(auth: AuthContext, userId: string, context: UserRequestContext) {
    const target = await targetOr404(auth, userId);
    assertCanModify(await caller(auth), target);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        pendingProfileImageObjectKey: true,
        pendingProfileImageFileName: true,
        pendingProfileImageMimeType: true,
        pendingProfileImageFileSize: true,
        profileImageObjectKey: true,
      },
    });
    if (
      !user.pendingProfileImageObjectKey ||
      !user.pendingProfileImageFileName ||
      !user.pendingProfileImageMimeType ||
      !user.pendingProfileImageFileSize
    )
      throw new ValidationError('No profile photo upload is awaiting confirmation.');
    const meta = await storageService.headObject(user.pendingProfileImageObjectKey);
    if (!meta) throw new ValidationError('Uploaded profile photo not found.');
    if (meta.size !== user.pendingProfileImageFileSize || meta.contentType !== user.pendingProfileImageMimeType)
      throw new ValidationError('Uploaded file does not match approved file.');
    const oldKey = user.profileImageObjectKey;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          profileImageObjectKey: user.pendingProfileImageObjectKey,
          profileImageBucket: storageService.bucket,
          profileImageStorageProvider: storageService.provider,
          profileImageMimeType: user.pendingProfileImageMimeType,
          profileImageFileSize: user.pendingProfileImageFileSize,
          profileImageConfirmedAt: new Date(),
          pendingProfileImageObjectKey: null,
          pendingProfileImageFileName: null,
          pendingProfileImageMimeType: null,
          pendingProfileImageFileSize: null,
        },
      });
      await tx.activityLog.create({
        data: auditData(auth, userId, ACTIVITY_ACTION.USER_UPDATED, context, { profileImageUpdated: true }),
      });
    });
    if (oldKey && oldKey !== user.pendingProfileImageObjectKey) {
      try {
        await storageService.deleteObject(oldKey);
      } catch {}
    }
    return this.details(auth, userId);
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
