import { Injectable } from "@nestjs/common";
import {
  EVENT_IMAGE_MIN_HEIGHT,
  EVENT_IMAGE_MIN_WIDTH,
  type EventImageContentType,
} from "@vira/shared";
import sharp, { type Metadata } from "sharp";

import {
  type ImageProcessor,
  InvalidImageError,
  type ProcessedImage,
} from "../application/ports/image-processor.js";
import { sniffImageType } from "../domain/event-image.js";

/**
 * Decoding is where a hostile file does harm (a "pixel bomb" of a few kB that expands
 * to gigabytes), so the decoder refuses anything past 40 megapixels before allocating.
 */
const MAX_INPUT_PIXELS = 40_000_000;
/** Largest side of the served picture: crisp on a 2× screen at the banner's width. */
const MAX_OUTPUT_SIDE = 2400;
const OUTPUT_QUALITY = 82;
/** The blurred preview: a few pixels, a few hundred bytes (docs/DESIGN.md#28). */
const BLUR_SIDE = 16;

const SHARP_FORMAT: Record<EventImageContentType, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

/** EXIF orientations 5–8 turn the picture a quarter: width and height swap. */
function uprightSize(metadata: Metadata): { width: number; height: number } {
  const width = metadata.width;
  const height = metadata.height;
  return (metadata.orientation ?? 1) >= 5 ? { width: height, height: width } : { width, height };
}

function decodeFailure(error: unknown): InvalidImageError {
  const message = error instanceof Error ? error.message : "";
  return new InvalidImageError(/pixel limit/i.test(message) ? "too-large" : "unreadable");
}

/** Pictures with libvips (`sharp`): checked, turned upright, resized and re-encoded to WebP. */
@Injectable()
export class SharpImageProcessor implements ImageProcessor {
  async process(file: Buffer, declaredType: EventImageContentType): Promise<ProcessedImage> {
    // The bytes decide what the file is, not its name nor the type the browser sent.
    const sniffed = sniffImageType(file);
    if (!sniffed) throw new InvalidImageError("not-an-image");
    if (sniffed !== declaredType) throw new InvalidImageError("type-mismatch");

    const input = () =>
      sharp(file, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", pages: 1 });

    let metadata: Metadata;
    try {
      metadata = await input().metadata();
    } catch (error) {
      throw decodeFailure(error);
    }
    if (metadata.format !== SHARP_FORMAT[declaredType]) {
      throw new InvalidImageError("type-mismatch");
    }
    if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
      throw new InvalidImageError("too-large");
    }
    const upright = uprightSize(metadata);
    if (upright.width < EVENT_IMAGE_MIN_WIDTH || upright.height < EVENT_IMAGE_MIN_HEIGHT) {
      throw new InvalidImageError("too-small");
    }

    try {
      // sharp writes no metadata unless asked to: EXIF, GPS, XMP and ICC comments are gone.
      const { data, info } = await input()
        .rotate()
        .resize({
          width: MAX_OUTPUT_SIDE,
          height: MAX_OUTPUT_SIDE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: OUTPUT_QUALITY })
        .toBuffer({ resolveWithObject: true });
      const blur = await sharp(data)
        .resize({ width: BLUR_SIDE, height: BLUR_SIDE, fit: "inside" })
        .webp({ quality: 50 })
        .toBuffer();
      return {
        data,
        contentType: "image/webp",
        width: info.width,
        height: info.height,
        blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
      };
    } catch (error) {
      throw decodeFailure(error);
    }
  }
}
