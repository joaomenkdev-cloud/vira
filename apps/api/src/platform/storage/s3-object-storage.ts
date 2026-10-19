import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { AppConfig } from "../config/config.schema.js";
import {
  ObjectTooLargeError,
  type ObjectStorage,
  type PresignedUpload,
  type StoredObject,
} from "./object-storage.js";

/** Upper bound for one call to the storage. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Headers signed into an upload URL: the storage recomputes the signature with the real ones. */
const SIGNED_UPLOAD_HEADERS = new Set(["content-type", "content-length"]);

/** S3 accepts at most 1000 keys per batch delete. */
const DELETE_BATCH = 1000;

export function createS3Client(config: AppConfig["storage"]): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // R2 and SeaweedFS both take path-style addresses (`<endpoint>/<bucket>/<key>`).
    forcePathStyle: true,
    // The SDK's default checksums end up in pre-signed URLs, and neither R2 nor
    // SeaweedFS accepts them from a browser: checksum only where S3 requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 2,
    requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS, connectionTimeout: 5_000 },
  });
}

function isMissing(error: unknown): boolean {
  return error instanceof NotFound || error instanceof NoSuchKey;
}

/** The bucket over the S3 API (`@aws-sdk/client-s3`). */
export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async presignUpload(
    key: string,
    options: { contentType: string; contentLength: number; expiresInSeconds: number },
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
      signableHeaders: SIGNED_UPLOAD_HEADERS,
    });
    // Browsers set Content-Length themselves (it is a forbidden header for scripts).
    return { url, headers: { "Content-Type": options.contentType } };
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: head.ContentLength ?? 0 };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async read(key: string, maxBytes: number): Promise<Buffer | null> {
    let response;
    try {
      // One byte past the limit is enough to tell that the object is too large.
      response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${maxBytes}` }),
      );
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const bytes = Buffer.from((await response.Body?.transformToByteArray()) ?? []);
    if (bytes.length > maxBytes) throw new ObjectTooLargeError();
    return bytes;
  }

  async write(
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl?: string },
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ...(options.cacheControl === undefined ? {} : { CacheControl: options.cacheControl }),
      }),
    );
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      const batch = keys.slice(start, start + DELETE_BATCH);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const failed = (result.Errors ?? []).filter((error) => error.Code !== "NoSuchKey");
      if (failed.length > 0) throw new Error(`Failed to delete ${failed.length} object(s)`);
    }
  }
}
