import type { PutObjectInput, StorageService, StoredObjectMetadata } from './storage.types.js';

type MemoryObject = StoredObjectMetadata & { body: Buffer };

export class MemoryStorageService implements StorageService {
  readonly provider = 'MEMORY' as const;
  readonly bucket = 'memory';
  private readonly objects = new Map<string, MemoryObject>();

  async putObject(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, {
      body: Buffer.from(input.body),
      size: input.body.length,
      contentType: input.contentType,
      checksum: input.checksum,
    });
  }

  async createUploadUrl(key: string): Promise<string> {
    return `memory://upload/${encodeURIComponent(key)}`;
  }

  async createDownloadUrl(key: string, fileName: string): Promise<string> {
    if (!this.objects.has(key)) throw new Error('Stored object not found.');
    return `memory://download/${encodeURIComponent(key)}?filename=${encodeURIComponent(fileName)}`;
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    const value = this.objects.get(key);
    if (!value) return null;
    return { size: value.size, contentType: value.contentType, checksum: value.checksum };
  }

  async getObject(key: string): Promise<Buffer | null> {
    return this.objects.get(key)?.body ?? null;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Test-only inspection; the provider is unreachable in production. */
  read(key: string): Buffer | undefined {
    return this.objects.get(key)?.body;
  }
}
