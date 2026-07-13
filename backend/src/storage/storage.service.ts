import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';

/**
 * StorageService — Google Cloud Storage wrapper for collateral documents.
 *
 * Provides upload, download, signed-URL, and delete operations on a single
 * GCS bucket. Files are stored with a deterministic key:
 *   `collateral/{collateralId}/{documentId}/{fileName}`
 *
 * Required env vars:
 *   - GCS_PROJECT_ID  — GCP project ID
 *   - GCS_KEY_FILE    — path to service-account JSON key
 *   - GCS_BUCKET      — bucket name (must already exist)
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: Storage;
  private bucketName!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.bucketName = this.config.getOrThrow<string>('GCS_BUCKET');
    const projectId = this.config.getOrThrow<string>('GCS_PROJECT_ID');
    const keyFile = this.config.getOrThrow<string>('GCS_KEY_FILE');

    this.client = new Storage({ projectId, keyFilename: keyFile });
    this.logger.log(`GCS storage initialised → bucket=${this.bucketName}`);
  }

  /** Build the object key inside the bucket. */
  get bucket(): string {
    return this.bucketName;
  }

  private buildKey(
    collateralId: string,
    documentId: string,
    fileName: string,
  ): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `collateral/${collateralId}/${documentId}/${safeName}`;
  }

  /**
   * Upload a file buffer to GCS. Returns the GCS URI (`gs://bucket/key`),
   * the SHA-256 hash of the content, and the MIME type.
   */
  async upload(
    collateralId: string,
    documentId: string,
    fileName: string,
    mimeType: string,
    content: Buffer,
  ): Promise<{ gcsUri: string; fileHash: string; key: string }> {
    const key = this.buildKey(collateralId, documentId, fileName);

    try {
      const bucket = this.client.bucket(this.bucketName);
      const file = bucket.file(key);

      await file.save(content, {
        metadata: { contentType: mimeType },
        resumable: false,
      });

      const fileHash = createHash('sha256').update(content).digest('hex');
      const gcsUri = `gs://${this.bucketName}/${key}`;

      this.logger.debug(
        `Uploaded ${fileName} → ${gcsUri} (${content.length} bytes)`,
      );
      return { gcsUri, fileHash, key };
    } catch (error) {
      this.logger.error(`Error uploading ${fileName} to GCS`, error);
      throw error;
    }
  }

  /**
   * Generate a time-limited signed download URL for a stored object.
   * Defaults to 15 minutes; caller may override.
   */
  async getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    try {
      const bucket = this.client.bucket(this.bucketName);
      const file = bucket.file(key);
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresInSeconds * 1000,
      });
      return url;
    } catch (error) {
      this.logger.error(`Error generating signed URL for ${key}`, error);
      throw error;
    }
  }

  /**
   * Generate a time-limited signed PUT URL so the browser can upload
   * directly to GCS. Returns the URL; the caller decides when to PUT.
   * The Content-Type header is bound to the signed URL so the browser
   * MUST send the matching header on the PUT request.
   */
  async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    try {
      const bucket = this.client.bucket(this.bucketName);
      const file = bucket.file(key);
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + expiresInSeconds * 1000,
        contentType,
      });
      return url;
    } catch (error) {
      this.logger.error(`Error generating signed upload URL for ${key}`, error);
      throw error;
    }
  }

  /** Build a key (exposed for callers that need the path before upload). */
  buildKeyPublic(
    collateralId: string,
    documentId: string,
    fileName: string,
  ): string {
    return this.buildKey(collateralId, documentId, fileName);
  }

  /** Stream the file content as a Buffer (for internal use / downloads). */
  async download(key: string): Promise<Buffer> {
    try {
      const bucket = this.client.bucket(this.bucketName);
      const file = bucket.file(key);
      const [content] = await file.download();
      return content;
    } catch (error) {
      this.logger.error(`Error downloading ${key} from GCS`, error);
      throw error;
    }
  }

  /** Delete an object from the bucket. */
  async delete(key: string): Promise<void> {
    try {
      const bucket = this.client.bucket(this.bucketName);
      await bucket.file(key).delete();
      this.logger.debug(`Deleted ${key} from GCS`);
    } catch (error) {
      this.logger.error(`Error deleting ${key} from GCS`, error);
      throw error;
    }
  }
}
