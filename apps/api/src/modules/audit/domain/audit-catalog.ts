import { ROLES } from "@vira/shared";
import { z } from "zod";

/**
 * Every auditable action, the entity it is about and the shape of its metadata
 * (docs/DATA_MODEL.md#audit_logs). Metadata schemas are strict: unknown keys are
 * rejected, and none of them may carry personal data (names, e-mails, free text),
 * because audit rows are kept for five years (docs/PRIVACY.md).
 */

const id = z.uuid();
const cents = z.number().int().nonnegative();

export const AUDIT_CATALOG = {
  "auth.login_succeeded": {
    entityType: "user",
    metadata: z.strictObject({ method: z.enum(["password", "google", "github"]) }),
  },
  "auth.login_failed": {
    entityType: "user",
    metadata: z.strictObject({
      reason: z.enum(["invalid_credentials", "locked", "email_not_verified"]),
    }),
  },
  "auth.refresh_reuse_detected": {
    entityType: "session",
    metadata: z.strictObject({ revokedSessions: z.number().int().positive() }),
  },
  "auth.password_changed": {
    entityType: "user",
    metadata: z.strictObject({ via: z.enum(["change", "reset"]) }),
  },
  "auth.logout_all": {
    entityType: "user",
    metadata: z.strictObject({ revokedSessions: z.number().int().nonnegative() }),
  },
  "event.published": { entityType: "event", metadata: z.strictObject({}) },
  "event.canceled": { entityType: "event", metadata: z.strictObject({}) },
  "order.created": {
    entityType: "order",
    metadata: z.strictObject({
      eventId: id,
      totalCents: cents,
      ticketCount: z.number().int().positive(),
    }),
  },
  "order.paid": {
    entityType: "order",
    metadata: z.strictObject({
      totalCents: cents,
      paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]+$/),
      late: z.boolean(),
    }),
  },
  "order.expired": { entityType: "order", metadata: z.strictObject({}) },
  "order.canceled": { entityType: "order", metadata: z.strictObject({}) },
  "order.refunded": {
    entityType: "order",
    metadata: z.strictObject({
      reason: z.enum(["late_payment", "event_canceled"]),
      totalCents: cents,
    }),
  },
  "payment.webhook_processed": {
    entityType: "payment",
    metadata: z.strictObject({
      stripeEventId: z.string().regex(/^evt_[A-Za-z0-9]+$/),
      type: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
    }),
  },
  "ticket.checked_in": {
    entityType: "ticket",
    metadata: z.strictObject({ eventId: id, method: z.enum(["qr", "code"]) }),
  },
  "user.data_exported": { entityType: "user", metadata: z.strictObject({}) },
  "user.anonymized": { entityType: "user", metadata: z.strictObject({}) },
  "admin.role_changed": {
    entityType: "user",
    metadata: z.strictObject({ from: z.enum(ROLES), to: z.enum(ROLES) }),
  },
} as const satisfies Record<string, { entityType: string; metadata: z.ZodType<object> }>;

export type AuditAction = keyof typeof AUDIT_CATALOG;
export type AuditEntityType = (typeof AUDIT_CATALOG)[AuditAction]["entityType"];
export type AuditMetadata<A extends AuditAction> = z.input<(typeof AUDIT_CATALOG)[A]["metadata"]>;

export const AUDIT_ACTIONS = Object.keys(AUDIT_CATALOG) as AuditAction[];
