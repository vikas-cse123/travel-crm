import { env } from '../../config/env.js';
import { MemoryStorageService } from './memory-storage.service.js';
import { S3StorageService } from './s3-storage.service.js';

export function sanitizeFileName(value: string): string {
  const leaf = value.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const safe = leaf
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');
  return safe.replace(/^\.+/, '').slice(0, 180) || 'file';
}

export function quotationObjectKey(input: {
  companyId: string;
  quotationId: string;
  versionId?: string | null;
  documentId: string;
  fileName: string;
  attachment?: boolean;
}): string {
  const fileName = sanitizeFileName(input.fileName);
  if (input.attachment && !input.versionId)
    return `companies/${input.companyId}/quotations/${input.quotationId}/attachments/${input.documentId}/${fileName}`;
  if (!input.versionId) throw new Error('A quotation version is required for this document.');
  return `companies/${input.companyId}/quotations/${input.quotationId}/versions/${input.versionId}/documents/${input.documentId}/${fileName}`;
}

export const storageService =
  env.STORAGE_PROVIDER === 's3' ? new S3StorageService() : new MemoryStorageService();

export { MemoryStorageService } from './memory-storage.service.js';
export type { StorageService } from './storage.types.js';
