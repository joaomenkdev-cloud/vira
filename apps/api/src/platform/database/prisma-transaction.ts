import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "./prisma.service.js";
import type { TransactionContext, TransactionRunner } from "./transaction.js";

/** Interactive transactions are bounded: long ones hold locks and connections. */
const TRANSACTION_TIMEOUT_MS = 30_000;
const TRANSACTION_MAX_WAIT_MS = 5_000;

const clients = new WeakMap<TransactionContext, Prisma.TransactionClient>();

/** The client to use for a query: the open transaction's, or the shared one outside any. */
export function clientFor(
  prisma: PrismaService,
  tx: TransactionContext | undefined,
): Prisma.TransactionClient {
  if (!tx) return prisma;
  const client = clients.get(tx);
  if (!client) throw new Error("Unknown or already closed transaction context.");
  return client;
}

@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (client) => {
        const context = Object.freeze({}) as TransactionContext;
        clients.set(context, client);
        try {
          return await work(context);
        } finally {
          clients.delete(context);
        }
      },
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );
  }
}
