import type { EventImageContentType } from "@vira/shared";

/** A picture ready to be shown: WebP, no metadata, upright. */
export interface ProcessedImage {
  readonly data: Buffer;
  readonly contentType: "image/webp";
  readonly width: number;
  readonly height: number;
  /** A few-pixel WebP of the picture, blurred, as a data URL. */
  readonly blurDataUrl: string;
}

export type ImageRejection =
  "not-an-image" | "type-mismatch" | "too-small" | "too-large" | "unreadable";

/** The file is not a picture the event can use; `reason` says why. */
export class InvalidImageError extends Error {
  constructor(readonly reason: ImageRejection) {
    super(`Invalid image: ${reason}`);
    this.name = "InvalidImageError";
  }
}

/**
 * Turns an uploaded file into the picture that is served. The original is never shown:
 * re-encoding drops EXIF (GPS included) and anything hidden in the file.
 */
export interface ImageProcessor {
  /** @throws InvalidImageError when the file is not a usable picture of `declaredType`. */
  process(file: Buffer, declaredType: EventImageContentType): Promise<ProcessedImage>;
}

export const IMAGE_PROCESSOR = Symbol("IMAGE_PROCESSOR");
