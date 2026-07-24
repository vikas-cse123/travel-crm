import crypto from 'node:crypto';
import { type Prisma, type MasterStatus } from '@prisma/client';
import {
  PERMISSIONS,
  type TestimonialImageUploadInput,
  type TestimonialInput,
  type TestimonialUpdateInput,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import {
  storageService,
  testimonialImageObjectKey,
} from '../../services/storage/storage.service.js';
import {
  buildPaginationMeta,
  resolvePagination,
  toPrismaPagination,
} from '../../utils/pagination.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';
import type { MastersRequestContext } from './airlines.service.js';

/**
 * Testimonials Master.
 *
 * Customer reviews with an optional private image. `destinationName` is free
 * text (the reference form is a plain input). `isVisible` is stored
 * configuration only — no PDF/web publishing is wired in this release.
 */

const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);
const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;
const PRESIGN_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;

const testimonialInclude = {
  createdBy: { select: userSelect },
  updatedBy: { select: userSelect },
} as const;

function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogUncheckedCreateInput['action'],
  entityId: string,
  context: MastersRequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'Testimonial',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** Drop tenant internals and never leak raw private storage keys. */
function present<T extends Record<string, unknown>>(row: T) {
  const {
    companyId,
    deletedAt,
    imageBucket,
    imageObjectKey,
    imageStorageProvider,
    pendingImageObjectKey,
    pendingImageFileName,
    pendingImageMimeType,
    pendingImageFileSize,
    ...safe
  } = row;
  void companyId;
  void deletedAt;
  void imageBucket;
  void imageStorageProvider;
  void pendingImageObjectKey;
  void pendingImageFileName;
  void pendingImageMimeType;
  void pendingImageFileSize;
  return { ...safe, hasImage: Boolean(imageObjectKey && row.imageConfirmedAt) };
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_TESTIMONIALS_UPDATE);
}

async function getTestimonial(auth: AuthContext, testimonialId: string, forManage = false) {
  const canManageRows = forManage ? true : await canManage(auth);
  const row = await prisma.testimonial.findFirst({
    where: {
      id: testimonialId,
      companyId: auth.companyId,
      ...(canManageRows ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: testimonialInclude,
  });
  if (!row) throw new NotFoundError('Testimonial not found.');
  return row;
}

function writeData(input: TestimonialInput | TestimonialUpdateInput) {
  const key = <K extends keyof (TestimonialInput & TestimonialUpdateInput)>(k: K) => k in input;
  return {
    ...(key('clientName') ? { clientName: blankToNull(input.clientName) } : {}),
    ...(key('destinationName') ? { destinationName: input.destinationName!.trim() } : {}),
    ...(key('description') ? { description: input.description!.trim() } : {}),
    ...(key('isVisible') ? { isVisible: Boolean(input.isVisible) } : {}),
  };
}

export const testimonialsService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManageRows = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;

    const where: Prisma.TestimonialWhereInput = {
      companyId: auth.companyId,
      ...(canManageRows
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(search
        ? {
            OR: [
              { clientName: { contains: search, mode: 'insensitive' } },
              { destinationName: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'createdAt');
    const orderBy: Prisma.TestimonialOrderByWithRelationInput =
      sortBy === 'clientName'
        ? { clientName: order }
        : sortBy === 'updatedAt'
          ? { updatedAt: order }
          : { createdAt: order };

    const [rows, total] = await Promise.all([
      prisma.testimonial.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: testimonialInclude,
      }),
      prisma.testimonial.count({ where }),
    ]);
    return {
      data: rows.map((row) => present(row as unknown as Record<string, unknown>)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  async details(auth: AuthContext, testimonialId: string) {
    return present(
      (await getTestimonial(auth, testimonialId)) as unknown as Record<string, unknown>,
    );
  },

  async create(auth: AuthContext, input: TestimonialInput, context: MastersRequestContext) {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.testimonial.create({
        data: {
          companyId: auth.companyId,
          destinationName: input.destinationName.trim(),
          description: input.description.trim(),
          clientName: blankToNull(input.clientName),
          isVisible: input.isVisible,
          status: input.status,
          createdById: auth.userId,
        },
        include: testimonialInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'TESTIMONIAL_CREATED', created.id, context, {
          destinationName: created.destinationName,
        }),
      });
      return created;
    });
    return present(row as unknown as Record<string, unknown>);
  },

  async update(
    auth: AuthContext,
    testimonialId: string,
    input: TestimonialUpdateInput,
    context: MastersRequestContext,
  ) {
    const current = await getTestimonial(auth, testimonialId, true);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.testimonial.update({
        where: { id: current.id },
        data: {
          ...writeData(input),
          updatedById: auth.userId,
          ...(input.status
            ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
            : {}),
        },
        include: testimonialInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'TESTIMONIAL_UPDATED', current.id, context, {
          changedFields: Object.keys(input),
        }),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>);
  },

  async status(
    auth: AuthContext,
    testimonialId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getTestimonial(auth, testimonialId, true);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.testimonial.update({
        where: { id: current.id },
        data: {
          status,
          updatedById: auth.userId,
          deletedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: testimonialInclude,
      });
      const action =
        current.status === 'ARCHIVED' && status !== 'ARCHIVED'
          ? 'TESTIMONIAL_RESTORED'
          : 'TESTIMONIAL_STATUS_CHANGED';
      await tx.activityLog.create({
        data: audit(auth, action, current.id, context, { previousStatus: current.status, status }),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>);
  },

  async archive(auth: AuthContext, testimonialId: string, context: MastersRequestContext) {
    const current = await getTestimonial(auth, testimonialId, true);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.testimonial.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: testimonialInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'TESTIMONIAL_ARCHIVED', current.id, context),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>);
  },

  // --- Image (private, tenant-scoped) --------------------------------------

  async createImageUpload(
    auth: AuthContext,
    testimonialId: string,
    input: TestimonialImageUploadInput,
  ) {
    const row = await getTestimonial(auth, testimonialId, true);
    const max = env.TESTIMONIAL_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Testimonial images must be ${env.TESTIMONIAL_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const key = testimonialImageObjectKey({
      companyId: auth.companyId,
      testimonialId,
      imageId: crypto.randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = row.pendingImageObjectKey;
    await prisma.testimonial.update({
      where: { id: row.id },
      data: {
        pendingImageObjectKey: key,
        pendingImageFileName: input.fileName,
        pendingImageMimeType: input.mimeType,
        pendingImageFileSize: input.fileSize,
      },
    });
    if (oldPending && oldPending !== key) await storageService.deleteObject(oldPending);
    return {
      uploadUrl: await storageService.createUploadUrl(
        key,
        input.mimeType,
        input.fileSize,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async confirmImage(auth: AuthContext, testimonialId: string, context: MastersRequestContext) {
    const row = await getTestimonial(auth, testimonialId, true);
    const key = row.pendingImageObjectKey;
    if (!key || !row.pendingImageFileName || !row.pendingImageMimeType || !row.pendingImageFileSize)
      throw new ValidationError('No testimonial image upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded testimonial image could not be found.');
    if (
      metadata.size !== row.pendingImageFileSize ||
      metadata.contentType !== row.pendingImageMimeType
    )
      throw new ValidationError('Uploaded image metadata does not match the approved file.');
    const oldKey = row.imageObjectKey;
    const action = oldKey ? 'TESTIMONIAL_IMAGE_REPLACED' : 'TESTIMONIAL_IMAGE_UPLOADED';
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.testimonial.update({
        where: { id: row.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          imageObjectKey: key,
          imageFileName: row.pendingImageFileName,
          imageMimeType: row.pendingImageMimeType,
          imageFileSize: row.pendingImageFileSize,
          imageConfirmedAt: new Date(),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
          updatedById: auth.userId,
        },
        include: testimonialInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, action, row.id, context, {
          mimeType: saved.imageMimeType,
          fileSize: saved.imageFileSize,
        }),
      });
      return saved;
    });
    if (oldKey && oldKey !== key) await storageService.deleteObject(oldKey);
    return present(updated as unknown as Record<string, unknown>);
  },

  async imageDownload(auth: AuthContext, testimonialId: string) {
    const row = await getTestimonial(auth, testimonialId);
    if (!row.imageObjectKey || !row.imageFileName || !row.imageConfirmedAt)
      throw new NotFoundError('Testimonial image not found.');
    return {
      url: await storageService.createDownloadUrl(
        row.imageObjectKey,
        row.imageFileName,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async deleteImage(auth: AuthContext, testimonialId: string, context: MastersRequestContext) {
    const row = await getTestimonial(auth, testimonialId, true);
    const keys = [row.imageObjectKey, row.pendingImageObjectKey].filter((value): value is string =>
      Boolean(value),
    );
    await prisma.$transaction(async (tx) => {
      await tx.testimonial.update({
        where: { id: row.id },
        data: {
          imageStorageProvider: null,
          imageBucket: null,
          imageObjectKey: null,
          imageFileName: null,
          imageMimeType: null,
          imageFileSize: null,
          imageConfirmedAt: null,
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
          updatedById: auth.userId,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'TESTIMONIAL_IMAGE_DELETED', row.id, context),
      });
    });
    await Promise.all(keys.map((key) => storageService.deleteObject(key)));
    return { deleted: true };
  },
};
