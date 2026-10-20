import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.js";
import { SanitizedMarkdownRenderer } from "../../modules/events/infra/sanitized-markdown-renderer.js";
import { SharpImageProcessor } from "../../modules/events/infra/sharp-image-processor.js";
import { ConfigValidationError, loadConfig } from "../../platform/config/load-config.js";
import { createS3Client, S3ObjectStorage } from "../../platform/storage/s3-object-storage.js";
import type { DemoPhoto } from "./demo-events.js";
import { resetDemo, seedDemo } from "./seed-demo.js";

const PHOTO_TIMEOUT_MS = 30_000;
/** Far above a 2400 × 1600 JPEG; anything bigger is not the photo the seed asked for. */
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/** Downloads a demo photo over HTTPS. */
export async function downloadPhoto(photo: DemoPhoto): Promise<Buffer> {
  let response;
  try {
    response = await fetch(photo.sourceUrl, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
  } catch (error) {
    throw new Error(`Could not download ${photo.sourceUrl}; is the internet reachable?`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(`Photo ${photo.sourceUrl} answered ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > PHOTO_MAX_BYTES) throw new Error(`Photo ${photo.sourceUrl} is too large.`);
  return bytes;
}

/**
 * `pnpm db:seed:demo [--reset]` (ADR-0010). Needs the database migrated and the bucket
 * set up (`pnpm --filter @vira/api storage:setup`); the photos come from the internet.
 */
export async function runDemoSeed(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  write: (message: string) => void = (message) => process.stdout.write(`${message}\n`),
): Promise<number> {
  const unknown = argv.filter((arg) => arg !== "--reset");
  if (unknown.length > 0) {
    write(`Unknown argument: ${unknown.join(" ")}. Usage: db:seed:demo [--reset]`);
    return 1;
  }
  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigValidationError)) throw error;
    write(error.message);
    return 1;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.database.url, application_name: "vira-seed" }),
  });
  const client = createS3Client(config.storage);
  const storage = new S3ObjectStorage(client, config.storage.bucket);
  try {
    if (argv.includes("--reset")) {
      const { events } = await resetDemo({ prisma, storage });
      write(`Removed ${events} demo event(s) and the demo organizer.`);
      return 0;
    }
    const result = await seedDemo({
      prisma,
      storage,
      images: new SharpImageProcessor(),
      markdown: new SanitizedMarkdownRenderer(),
      fetchPhoto: downloadPhoto,
      now: () => new Date(),
      log: write,
    });
    write(
      `${result.events} demo events ready (${result.photosFetched} photo(s) downloaded). ` +
        `Remove them with: pnpm db:seed:demo --reset`,
    );
    return 0;
  } finally {
    client.destroy();
    await prisma.$disconnect();
  }
}
