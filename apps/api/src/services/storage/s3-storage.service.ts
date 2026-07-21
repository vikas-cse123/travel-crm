import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';
import type { PutObjectInput, StorageService, StoredObjectMetadata } from './storage.types.js';

export class S3StorageService implements StorageService {
  readonly provider = 'S3' as const;
  readonly bucket = env.AWS_S3_BUCKET;
  private readonly client = new S3Client({
    region: env.AWS_REGION,
    ...(env.AWS_S3_ENDPOINT ? { endpoint: env.AWS_S3_ENDPOINT } : {}),
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
    // Credentials intentionally omitted: the SDK default chain supports IAM
    // roles and only reads AWS_* static credentials when explicitly supplied.
  });

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ServerSideEncryption: env.AWS_S3_SERVER_SIDE_ENCRYPTION,
        ...(input.checksum ? { Metadata: { checksum: input.checksum } } : {}),
      }),
    );
  }

  async createUploadUrl(key: string, contentType: string, size: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
        ServerSideEncryption: env.AWS_S3_SERVER_SIDE_ENCRYPTION,
      }),
      { expiresIn: env.AWS_S3_PRESIGNED_URL_EXPIRY_SECONDS },
    );
  }

  async createDownloadUrl(key: string, fileName: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\]/g, '_')}"`,
      }),
      { expiresIn: env.AWS_S3_PRESIGNED_URL_EXPIRY_SECONDS },
    );
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
        checksum: result.Metadata?.checksum,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
