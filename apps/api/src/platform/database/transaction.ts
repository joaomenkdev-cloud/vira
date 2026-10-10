declare const transactionBrand: unique symbol;

/**
 * Opaque handle of an open database transaction. Use cases pass it to the
 * repositories that must take part in the same transaction; only `infra` code can
 * turn it back into a database client (docs/ARCHITECTURE.md, outbox).
 */
export interface TransactionContext {
  readonly [transactionBrand]: true;
}

/** Runs `work` in one database transaction: it commits on return and rolls back on throw. */
export interface TransactionRunner {
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export const TRANSACTION_RUNNER = Symbol("TRANSACTION_RUNNER");
