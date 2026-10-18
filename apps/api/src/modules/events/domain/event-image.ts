import type { EventImageContentType } from "@vira/shared";

/**
 * How a picture reaches an event (docs/DATA_MODEL.md#media_uploads): the browser sends the
 * original to `uploads/…` with a pre-signed URL; the confirmation checks it, re-encodes it
 * and writes the result to `events/…`, the only object ever shown.
 */

/** Minutes the pre-signed URL accepts the file. */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * How long after the URL expires a confirmation is still taken: the `PUT` may have
 * started just before the end and a slow connection takes a while to finish it.
 */
export const CONFIRMATION_GRACE_MS = 15 * 60_000;

const EXTENSIONS: Record<EventImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function uploadObjectKey(
  eventId: string,
  uploadId: string,
  type: EventImageContentType,
): string {
  return `uploads/${eventId}/${uploadId}.${EXTENSIONS[type]}`;
}

/** A fresh key per confirmation attempt, so two attempts never write over each other. */
export function imageObjectKey(eventId: string, imageId: string): string {
  return `events/${eventId}/${imageId}.webp`;
}

/**
 * The real format of a file, from its first bytes (magic numbers), whatever its name or
 * declared type say. `null` for anything else (a script, a PDF, a GIF, SVG text...).
 */
export function sniffImageType(bytes: Uint8Array): EventImageContentType | null {
  const starts = (signature: readonly number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** Whether a confirmation for an upload that expires at `expiresAt` still counts. */
export function stillConfirmable(expiresAt: Date, now: Date): boolean {
  return now.getTime() <= expiresAt.getTime() + CONFIRMATION_GRACE_MS;
}
