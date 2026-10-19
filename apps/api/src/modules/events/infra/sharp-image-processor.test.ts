import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { InvalidImageError } from "../application/ports/image-processor.js";
import { sniffImageType } from "../domain/event-image.js";
import { SharpImageProcessor } from "./sharp-image-processor.js";

const processor = new SharpImageProcessor();

/** A real picture of the given size and format, made on the spot. */
function picture(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp" = "jpeg",
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 217, g: 45, b: 58 } },
  })
    .toFormat(format)
    .toBuffer();
}

function rejection(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "accepted",
    (error: unknown) => (error instanceof InvalidImageError ? error.reason : String(error)),
  );
}

describe("sniffImageType", () => {
  it("tells the format from the first bytes", async () => {
    expect(sniffImageType(await picture(10, 10, "jpeg"))).toBe("image/jpeg");
    expect(sniffImageType(await picture(10, 10, "png"))).toBe("image/png");
    expect(sniffImageType(await picture(10, 10, "webp"))).toBe("image/webp");
    expect(sniffImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffImageType(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(Buffer.from("RIFF0000WAVE"))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("SharpImageProcessor", () => {
  it("re-encodes to WebP, keeps the size and makes a tiny blurred preview", async () => {
    const result = await processor.process(await picture(1600, 900, "png"), "image/png");

    expect(result.contentType).toBe("image/webp");
    expect(sniffImageType(result.data)).toBe("image/webp");
    expect({ width: result.width, height: result.height }).toEqual({ width: 1600, height: 900 });
    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
    expect(result.blurDataUrl.length).toBeLessThan(2000);
    const blur = await sharp(
      Buffer.from(result.blurDataUrl.split(",")[1] ?? "", "base64"),
    ).metadata();
    expect(Math.max(blur.width, blur.height)).toBe(16);
  });

  it("shrinks large pictures to 2400 pixels on the longest side, never enlarges", async () => {
    const large = await processor.process(await picture(4800, 2400), "image/jpeg");
    expect({ width: large.width, height: large.height }).toEqual({ width: 2400, height: 1200 });
    const small = await processor.process(await picture(1200, 600), "image/jpeg");
    expect({ width: small.width, height: small.height }).toEqual({ width: 1200, height: 600 });
  });

  it("drops EXIF, GPS included, and turns the picture upright", async () => {
    const withExif = await sharp(await picture(900, 1600))
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { Artist: "Fulana", Copyright: "Fulana" }, IFD3: { GPSLatitudeRef: "S" } },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await processor.process(withExif, "image/jpeg");
    const metadata = await sharp(result.data).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    // Orientation 6 is a quarter turn: the 900 × 1600 file is a 1600 × 900 picture.
    expect({ width: result.width, height: result.height }).toEqual({ width: 1600, height: 900 });
  });

  it.each([
    ["a text file called .jpg", Buffer.from("isto não é uma imagem"), "image/jpeg", "not-an-image"],
    [
      "an SVG, which may carry scripts",
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      "image/png",
      "not-an-image",
    ],
    [
      "an HTML page",
      Buffer.from("<!doctype html><script>alert(1)</script>"),
      "image/webp",
      "not-an-image",
    ],
  ] as const)("refuses %s", async (_case, file, type, reason) => {
    expect(await rejection(processor.process(file, type))).toBe(reason);
  });

  it("refuses a picture whose bytes say another format than the one declared", async () => {
    expect(await rejection(processor.process(await picture(1600, 900, "png"), "image/jpeg"))).toBe(
      "type-mismatch",
    );
  });

  it("refuses a truncated file, even with the right first bytes", async () => {
    const whole = await picture(1600, 900, "png");
    expect(
      await rejection(processor.process(whole.subarray(0, whole.length / 2), "image/png")),
    ).toBe("unreadable");
    const jpegHeader = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
    expect(await rejection(processor.process(jpegHeader, "image/jpeg"))).toBe("unreadable");
  });

  it("refuses pictures below 1200 × 600", async () => {
    expect(await rejection(processor.process(await picture(1199, 800), "image/jpeg"))).toBe(
      "too-small",
    );
    expect(await rejection(processor.process(await picture(1600, 599), "image/jpeg"))).toBe(
      "too-small",
    );
  });

  it("refuses a pixel bomb before decoding it", async () => {
    // 10 000 × 10 000 of one color: a small PNG that would take 300 MB once decoded.
    const bomb = await sharp({
      create: { width: 10_000, height: 10_000, channels: 3, background: "#fff" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    expect(await rejection(processor.process(bomb, "image/png"))).toBe("too-large");
  });
});
