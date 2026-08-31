import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import type { PutObjectInput, StorageService, StoredObjectMetadata } from './storage.types.js';

/**
 * Local-disk storage for development.
 *
 * Production always runs `STORAGE_PROVIDER=s3` with presigned S3 URLs; the
 * in-memory provider loses every object on restart, which breaks previously
 * generated quotation PDFs and uploaded master images during a dev session.
 * This provider keeps the same presigned-URL security model as S3 — URLs are
 * HMAC-signed and time-limited and served through a dedicated API route — so
 * nothing about the PDF/Weblink flows changes, only where the bytes live.
 */

const DEFAULT_EXPIRY_SECONDS = env.AWS_S3_PRESIGNED_URL_EXPIRY_SECONDS;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function mimeFromExtension(extension: string): string {
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export class DiskStorageService implements StorageService {
  readonly provider = 'LOCAL' as const;
  readonly bucket = 'local-disk';
  private readonly root: string;

  constructor(root: string = env.STORAGE_LOCAL_DIR) {
    this.root = path.resolve(root);
  }

  /** Resolve a key inside the root, refusing path-traversal escapes. */
  private resolve(key: string): string {
    const safe = path.resolve(this.root, key);
    if (safe !== this.root && !safe.startsWith(this.root + path.sep))
      throw new Error('Invalid storage key.');
    return safe;
  }

  private sign(payload: string): string {
    return createHmac('sha256', env.TOKEN_PEPPER).update(payload).digest('hex');
  }

  /** Presigned-style URL served by GET/PUT /api/storage/objects/:key. */
  private signedUrl(
    key: string,
    action: 'download' | 'upload',
    expiresInSeconds: number,
    extra: Record<string, string>,
  ): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = this.sign(`${action}|${key}|${expires}`);
    const params = new URLSearchParams({ expires: String(expires), sig, ...extra });
    return `${env.API_URL}/api/storage/objects/${Buffer.from(key).toString('base64url')}?${params}`;
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const target = this.resolve(input.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.body);
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    _size: number,
    expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
  ): Promise<string> {
    void _size;
    return this.signedUrl(key, 'upload', expiresInSeconds, {
      contentType: contentType || 'application/octet-stream',
    });
  }

  async createDownloadUrl(
    key: string,
    fileName: string,
    expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
    disposition: 'attachment' | 'inline' = 'attachment',
  ): Promise<string> {
    return this.signedUrl(key, 'download', expiresInSeconds, {
      filename: fileName,
      disposition,
    });
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    const target = this.resolve(key);
    if (!existsSync(target)) return null;
    const body = await readFile(target);
    return {
      size: body.length,
      // The disk provider stores raw files without metadata; infer the content
      // type from the file extension so inline PDFs/images render in-browser
      // exactly like the S3 presigned URLs they mirror.
      contentType: mimeFromExtension(path.extname(target).toLowerCase()),
      checksum: undefined,
    };
  }

  async getObject(key: string): Promise<Buffer | null> {
    const target = this.resolve(key);
    if (!existsSync(target)) return null;
    return readFile(target);
  }

  async deleteObject(key: string): Promise<void> {
    const target = this.resolve(key);
    if (existsSync(target)) await rm(target);
  }
}
