import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';

export interface StoredMasterImage {
  id: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  confirmedAt: string;
}

export interface LegacyImageFields {
  images?: unknown;
  imageObjectKey: string | null;
  imageFileName: string | null;
  imageMimeType: string | null;
  imageFileSize: number | null;
  imageConfirmedAt: Date | null;
}

const isStoredImage = (value: unknown): value is StoredMasterImage => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.objectKey === 'string' &&
    typeof row.fileName === 'string' &&
    typeof row.mimeType === 'string' &&
    typeof row.fileSize === 'number' &&
    Number.isFinite(row.fileSize) &&
    typeof row.confirmedAt === 'string' &&
    Number.isFinite(Date.parse(row.confirmedAt))
  );
};

/** Ordered gallery with a lossless fallback for records created before galleries. */
export function effectiveMasterImages(row: LegacyImageFields): StoredMasterImage[] {
  if (Array.isArray(row.images)) {
    const images = row.images.filter(isStoredImage);
    if (images.length > 0 || row.images.length === 0) return images;
  }
  if (row.imageObjectKey && row.imageFileName && row.imageConfirmedAt) {
    return [
      {
        id: `legacy-${crypto
          .createHash('sha256')
          .update(row.imageObjectKey)
          .digest('hex')
          .slice(0, 32)}`,
        objectKey: row.imageObjectKey,
        fileName: row.imageFileName,
        mimeType: row.imageMimeType ?? 'image/jpeg',
        fileSize: row.imageFileSize ?? 0,
        confirmedAt: row.imageConfirmedAt.toISOString(),
      },
    ];
  }
  return [];
}

export function presentMasterImages(row: LegacyImageFields) {
  return effectiveMasterImages(row).map(({ id, fileName, mimeType, fileSize }, index) => ({
    id,
    fileName,
    mimeType,
    fileSize,
    isPrimary: index === 0,
  }));
}

export function appendMasterImage(
  row: LegacyImageFields,
  pending: { objectKey: string; fileName: string; mimeType: string; fileSize: number },
  confirmedAt = new Date(),
): StoredMasterImage[] {
  return [
    ...effectiveMasterImages(row),
    {
      id: crypto.randomUUID(),
      objectKey: pending.objectKey,
      fileName: pending.fileName,
      mimeType: pending.mimeType,
      fileSize: pending.fileSize,
      confirmedAt: confirmedAt.toISOString(),
    },
  ];
}

/**
 * Keeps the retained single-image columns aligned with the ordered gallery.
 * Those columns are intentionally not removed: older application versions and
 * legacy quotation code still read them as the primary-image fallback.
 */
export function masterImageWriteData(images: StoredMasterImage[]) {
  const primary = images[0] ?? null;
  return {
    images: images as unknown as Prisma.InputJsonValue,
    imageObjectKey: primary?.objectKey ?? null,
    imageFileName: primary?.fileName ?? null,
    imageMimeType: primary?.mimeType ?? null,
    imageFileSize: primary?.fileSize ?? null,
    imageConfirmedAt: primary ? new Date(primary.confirmedAt) : null,
  };
}

export function findMasterImage(row: LegacyImageFields, imageId?: string) {
  const images = effectiveMasterImages(row);
  return imageId ? images.find((image) => image.id === imageId) : images[0];
}

export function reorderMasterImages(row: LegacyImageFields, imageIds: string[]) {
  const images = effectiveMasterImages(row);
  if (imageIds.length !== images.length || new Set(imageIds).size !== images.length) return null;
  const byId = new Map(images.map((image) => [image.id, image]));
  const ordered = imageIds.map((id) => byId.get(id));
  return ordered.every(Boolean) ? (ordered as StoredMasterImage[]) : null;
}

export function removeMasterImage(row: LegacyImageFields, imageId?: string) {
  const images = effectiveMasterImages(row);
  const target = imageId ? images.find((image) => image.id === imageId) : images[0];
  if (!target) return null;
  return { target, images: images.filter((image) => image.id !== target.id) };
}
