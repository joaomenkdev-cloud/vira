import { Global, Module } from "@nestjs/common";

import { PrismaTransactionRunner } from "./prisma-transaction.js";
import { PrismaService } from "./prisma.service.js";
import { TRANSACTION_RUNNER } from "./transaction.js";

@Global()
@Module({
  providers: [PrismaService, { provide: TRANSACTION_RUNNER, useClass: PrismaTransactionRunner }],
  exports: [PrismaService, TRANSACTION_RUNNER],
})
export class DatabaseModule {}
