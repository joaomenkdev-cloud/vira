import { ConfigValidationError, loadConfig } from "../platform/config/load-config.js";
import { setUpBucket } from "../platform/storage/bucket-setup.js";
import { createS3Client } from "../platform/storage/s3-object-storage.js";

/**
 * `pnpm --filter @vira/api storage:setup`: creates the bucket if it is missing and sets
 * its CORS rule for WEB_ORIGIN. Safe to run again; run it whenever WEB_ORIGIN changes.
 */
export async function setupStorage(
  env: NodeJS.ProcessEnv,
  write: (message: string) => void = (message) => process.stdout.write(`${message}\n`),
): Promise<number> {
  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigValidationError)) throw error;
    write(error.message);
    return 1;
  }
  const client = createS3Client(config.storage);
  try {
    const { created } = await setUpBucket(client, config.storage.bucket, config.http.webOrigin);
    write(
      `Bucket "${config.storage.bucket}" ${created ? "created" : "found"}; uploads allowed from ${config.http.webOrigin}.`,
    );
    return 0;
  } finally {
    client.destroy();
  }
}
