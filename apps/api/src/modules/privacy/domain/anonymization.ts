/**
 * What replaces personal data once it must go (docs/PRIVACY.md#o-que-acontece-ao-excluir-a-conta
 * and #5-retenção-automática). Fixed words, not blanks: the rows stay readable (a receipt, a
 * check-in history) without pointing at anyone.
 */
export const ANONYMIZED = {
  userName: "Conta excluída",
  organizerName: "Organizador removido",
  holderName: "Titular removido",
  buyerName: "Comprador removido",
} as const;

/** An address that can never receive mail (`.invalid` is reserved, RFC 2606), one per account. */
export function anonymizedEmail(userId: string): string {
  return `deleted+${userId}@invalid`;
}

/** The public slug of a removed organizer: no longer derived from the name. */
export function anonymizedSlug(profileId: string): string {
  return `organizador-removido-${profileId.slice(0, 8)}`;
}

const DAY_MS = 24 * 60 * 60_000;

/** How long each kind of data is kept (docs/PRIVACY.md#5-retenção-automática). */
export const RETENTION = {
  /** Holder names and door reads, after the event ends. */
  afterEventMs: 90 * DAY_MS,
  /** Sessions, after they expire. */
  expiredSessionsMs: 30 * DAY_MS,
  /** Buyer name and e-mail on orders (receipts, chargebacks), after the purchase. */
  ordersMs: 5 * 365 * DAY_MS,
  /** Stripe events already applied, after they were processed. */
  webhookEventsMs: 90 * DAY_MS,
} as const;

/** The cutoffs of one retention round: whatever is older goes. */
export interface RetentionCutoffs {
  readonly eventsEndedBefore: Date;
  readonly sessionsExpiredBefore: Date;
  readonly tokensExpiredBefore: Date;
  readonly ordersCreatedBefore: Date;
  readonly webhookEventsBefore: Date;
}

export function retentionCutoffs(now: Date): RetentionCutoffs {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return {
    eventsEndedBefore: ago(RETENTION.afterEventMs),
    sessionsExpiredBefore: ago(RETENTION.expiredSessionsMs),
    tokensExpiredBefore: now,
    ordersCreatedBefore: ago(RETENTION.ordersMs),
    webhookEventsBefore: ago(RETENTION.webhookEventsMs),
  };
}
