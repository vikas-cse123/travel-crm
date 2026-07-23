export interface StoredObjectMetadata {
  size: number;
  contentType: string | undefined;
  checksum: string | undefined;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  checksum?: string;
}

export interface StorageService {
  readonly provider: 'S3' | 'MEMORY';
  readonly bucket: string;
  putObject(input: PutObjectInput): Promise<void>;
  createUploadUrl(
    key: string,
    contentType: string,
    size: number,
    expiresInSeconds?: number,
  ): Promise<string>;
  createDownloadUrl(key: string, fileName: string, expiresInSeconds?: number): Promise<string>;
  headObject(key: string): Promise<StoredObjectMetadata | null>;
  /** Read an object's bytes, or null if it does not exist. Used for PDF logos. */
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
}
