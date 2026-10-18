import {
  CreateBucketCommand,
  HeadBucketCommand,
  NotFound,
  PutBucketCorsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

/** How long browsers may cache the answer to the CORS preflight of an upload. */
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Prepares the bucket for browser uploads: creates it if it does not exist (locally;
 * on R2 it is created in the dashboard) and allows `PUT` from the web's origin only,
 * with the one header the upload signs. Reading stays private: pictures are shown
 * through pre-signed `GET` URLs, which are plain navigations and need no CORS.
 */
export async function setUpBucket(
  client: S3Client,
  bucket: string,
  webOrigin: string,
): Promise<{ created: boolean }> {
  let created = false;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!(error instanceof NotFound)) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    created = true;
  }
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [webOrigin],
            AllowedMethods: ["PUT"],
            AllowedHeaders: ["content-type"],
            MaxAgeSeconds: PREFLIGHT_MAX_AGE_SECONDS,
          },
        ],
      },
    }),
  );
  return { created };
}
