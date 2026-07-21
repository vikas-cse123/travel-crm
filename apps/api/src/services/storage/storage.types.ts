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
  createUploadUrl(key: string, contentType: string, size: number): Promise<string>;
  createDownloadUrl(key: string, fileName: string): Promise<string>;
  headObject(key: string): Promise<StoredObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
}
