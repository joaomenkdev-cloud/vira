import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.js";
import type { AppConfig } from "../config/config.schema.js";
import { APP_CONFIG } from "../config/config.module.js";

/** Upper bound for any single statement (docs/SECURITY_MODEL.md, "Limites"). */
export const STATEMENT_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * The single Prisma client of the process. It connects lazily, so the API starts
 * (and reports itself not ready) while the database is unreachable. Only `infra`
 * code may inject it (ADR-0002).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.database.url,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        statement_timeout: STATEMENT_TIMEOUT_MS,
        application_name: "vira-api",
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
