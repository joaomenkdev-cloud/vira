import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import type { S3Client } from "@aws-sdk/client-s3";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";
import { OBJECT_STORAGE } from "./object-storage.js";
import { createS3Client, S3ObjectStorage } from "./s3-object-storage.js";

/** The S3 client of the process, closed with it. */
@Injectable()
export class StorageClient implements OnModuleDestroy {
  readonly client: S3Client;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createS3Client(config.storage);
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

@Global()
@Module({
  providers: [
    StorageClient,
    {
      provide: OBJECT_STORAGE,
      inject: [StorageClient, APP_CONFIG],
      useFactory: (storage: StorageClient, config: AppConfig) =>
        new S3ObjectStorage(storage.client, config.storage.bucket),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
