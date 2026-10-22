import type { DataExport } from "@vira/shared";

import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { RetentionCutoffs } from "../../domain/anonymization.js";

/** The export without its envelope: what the account holds, timestamps as ISO strings. */
export type AccountData = Omit<DataExport, "format" | "exportedAt">;

/** How an erasure ended. */
export type ErasureResult = "erased" | "missing" | "upcoming-events";

/** How many rows each retention rule changed or removed in one round. */
export interface RetentionSummary {
  readonly holdersAnonymized: number;
  readonly checkinAttemptsPurged: number;
  readonly sessionsPurged: number;
  readonly tokensPurged: number;
  readonly ordersAnonymized: number;
  readonly webhookEventsPurged: number;
}

/**
 * Where personal data lives, across the tables of every module (the inventory of
 * docs/PRIVACY.md#2-inventário-de-dados-pessoais): this port is the one place that reads
 * all of it for an export and removes all of it for an erasure.
 */
export interface PrivacyRepository {
  /** Everything the account holds; null when there is no such (live) account. */
  exportOf(userId: string, now: Date): Promise<AccountData | null>;

  /**
   * Anonymizes the account and what points at it (docs/PRIVACY.md#o-que-acontece-ao-excluir-a-conta),
   * unless it organizes a published event that has not ended. Locks the account first, so
   * two erasures of the same account run one after the other.
   */
  erase(userId: string, now: Date, tx: TransactionContext): Promise<ErasureResult>;

  /** One round of the retention rules (docs/PRIVACY.md#5-retenção-automática). */
  applyRetention(cutoffs: RetentionCutoffs): Promise<RetentionSummary>;
}

export const PRIVACY_REPOSITORY = Symbol("PRIVACY_REPOSITORY");
