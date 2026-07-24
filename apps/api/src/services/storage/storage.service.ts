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

export function bookingObjectKey(input: {
  companyId: string;
  bookingId: string;
  documentId: string;
  fileName: string;
  travellerId?: string | null;
  serviceId?: string | null;
  paymentId?: string | null;
}): string {
  const name = sanitizeFileName(input.fileName);
  const base = `companies/${input.companyId}/bookings/${input.bookingId}`;
  if (input.travellerId)
    return `${base}/travellers/${input.travellerId}/documents/${input.documentId}/${name}`;
  if (input.serviceId)
    return `${base}/services/${input.serviceId}/documents/${input.documentId}/${name}`;
  if (input.paymentId)
    return `${base}/payments/${input.paymentId}/receipts/${input.documentId}/${name}`;
  return `${base}/documents/${input.documentId}/${name}`;
}

export function customerObjectKey(input: {
  companyId: string;
  customerId: string;
  documentId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/customers/${input.customerId}/documents/${input.documentId}/${sanitizeFileName(input.fileName)}`;
}

export function vendorObjectKey(input: {
  companyId: string;
  vendorId: string;
  documentId: string;
  fileName: string;
  serviceId?: string | null;
  paymentId?: string | null;
}): string {
  const name = sanitizeFileName(input.fileName);
  const base = `companies/${input.companyId}/vendors/${input.vendorId}`;
  if (input.serviceId)
    return `${base}/services/${input.serviceId}/documents/${input.documentId}/${name}`;
  if (input.paymentId)
    return `${base}/payments/${input.paymentId}/receipts/${input.documentId}/${name}`;
  return `${base}/documents/${input.documentId}/${name}`;
}

export function destinationImageObjectKey(input: {
  companyId: string;
  destinationId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/masters/destinations/${input.destinationId}/images/${input.imageId}/${sanitizeFileName(input.fileName)}`;
}

export function hotelImageObjectKey(input: {
  companyId: string;
  hotelId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/masters/hotels/${input.hotelId}/images/${input.imageId}/${sanitizeFileName(input.fileName)}`;
}

export function airlineLogoObjectKey(input: {
  companyId: string;
  airlineId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/masters/airlines/${input.airlineId}/logos/${input.imageId}/${sanitizeFileName(input.fileName)}`;
}

/** Private, tenant-scoped key for the company branding logo (Phase 18). */
export function companyLogoObjectKey(input: {
  companyId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/branding/logo/${input.imageId}-${sanitizeFileName(input.fileName)}`;
}

export function cruiseImageObjectKey(input: {
  companyId: string;
  cruiseId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/masters/cruises/${input.cruiseId}/images/${input.imageId}/${sanitizeFileName(input.fileName)}`;
}

export function vehicleImageObjectKey(input: {
  companyId: string;
  vehicleId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/masters/vehicles/${input.vehicleId}/images/${input.imageId}/${sanitizeFileName(input.fileName)}`;
}

export function sightseeingImageObjectKey(input: {
  companyId: string;
  sightseeingId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/masters/sightseeing/${input.sightseeingId}/images/${input.imageId}/${sanitizeFileName(input.fileName)}`;
}

export function testimonialImageObjectKey(input: {
  companyId: string;
  testimonialId: string;
  imageId: string;
  fileName: string;
}): string {
  return `companies/${input.companyId}/masters/testimonials/${input.testimonialId}/images/${input.imageId}/${sanitizeFileName(input.fileName)}`;
}

export const storageService =
  env.STORAGE_PROVIDER === 's3' ? new S3StorageService() : new MemoryStorageService();

export { MemoryStorageService } from './memory-storage.service.js';
export type { StorageService } from './storage.types.js';
