import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import QRCode from "qrcode";

/**
 * What the fake camera shows: a QR with this token, which the check-in tests give to a
 * ticket of their event (POST /__test/checkin/event?token=).
 */
export const FAKE_CAMERA_TOKEN = "v1.e2e.camera-ticket";

const WIDTH = 640;
const HEIGHT = 480;

/**
 * Where the video is written: in the project's own cache (not the shared temp directory,
 * where another user could plant the file), outside test-results, which Playwright
 * empties on start.
 */
export const FAKE_CAMERA_FILE = join(
  import.meta.dirname,
  "..",
  "..",
  "node_modules",
  ".cache",
  "vira-e2e",
  "fake-camera.y4m",
);

/**
 * Writes a one-frame Y4M video of the QR, black on white, for Chromium's fake camera
 * (`--use-file-for-fake-video-capture`). Chromium loops it, so the QR never leaves the
 * frame. Only luma carries the picture; both chroma planes are neutral grey.
 */
export function writeFakeCamera(path = FAKE_CAMERA_FILE): string {
  const qr = QRCode.create(FAKE_CAMERA_TOKEN, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  // Four modules of quiet zone around the code, as the standard asks.
  const module = Math.floor(HEIGHT / (size + 8));
  const left = Math.floor((WIDTH - module * size) / 2);
  const top = Math.floor((HEIGHT - module * size) / 2);
  const luma = Buffer.alloc(WIDTH * HEIGHT, 255);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!data[row * size + column]) continue;
      for (let y = 0; y < module; y += 1) {
        const start = (top + row * module + y) * WIDTH + left + column * module;
        luma.fill(0, start, start + module);
      }
    }
  }
  const chroma = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2) * 2, 128);
  // Every worker loads the config and writes the file again: a rename swaps it whole,
  // so a browser starting meanwhile never reads half of it.
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.${String(process.pid)}`;
  writeFileSync(
    partial,
    Buffer.concat([
      Buffer.from(`YUV4MPEG2 W${String(WIDTH)} H${String(HEIGHT)} F10:1 Ip A1:1 C420jpeg\nFRAME\n`),
      luma,
      chroma,
    ]),
  );
  renameSync(partial, path);
  return path;
}

/** The Chromium switches that put the fake camera in place and accept its prompt. */
export function fakeCameraArgs(): string[] {
  return [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${writeFakeCamera()}`,
  ];
}
