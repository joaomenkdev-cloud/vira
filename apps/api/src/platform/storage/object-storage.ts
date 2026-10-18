/** A browser upload the storage accepts for a few minutes: one object, one type, one size. */
export interface PresignedUpload {
  readonly url: string;
  /** Headers the `PUT` must carry exactly: they are part of the signature. */
  readonly headers: Readonly<Record<string, string>>;
}

export interface StoredObject {
  readonly sizeBytes: number;
}

/** The object holds more bytes than the caller is willing to read. */
export class ObjectTooLargeError extends Error {
  constructor() {
    super("Object larger than allowed");
    this.name = "ObjectTooLargeError";
  }
}

/**
 * The private bucket (S3 API: Cloudflare R2 in production, SeaweedFS locally; ADR-0012).
 * Keys are always made by the server; nothing here takes a key or a URL from a client.
 */
export interface ObjectStorage {
  /**
   * A pre-signed `PUT` for `key`. The content type and the exact length are signed, so
   * the storage refuses any other file (docs/SECURITY_MODEL.md, "Upload").
   */
  presignUpload(
    key: string,
    options: {
      readonly contentType: string;
      readonly contentLength: number;
      readonly expiresInSeconds: number;
    },
  ): Promise<PresignedUpload>;

  /** A pre-signed `GET` for `key`, for showing a private object for a while. */
  presignDownload(key: string, expiresInSeconds: number): Promise<string>;

  /** The object's size, or `null` when there is no such object. */
  stat(key: string): Promise<StoredObject | null>;

  /**
   * The object's bytes, or `null` when there is no such object.
   * @throws ObjectTooLargeError past `maxBytes`, without reading the rest.
   */
  read(key: string, maxBytes: number): Promise<Buffer | null>;

  write(
    key: string,
    body: Buffer,
    options: { readonly contentType: string; readonly cacheControl?: string },
  ): Promise<void>;

  /** Deletes the objects; keys that do not exist are not an error. */
  delete(keys: readonly string[]): Promise<void>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
