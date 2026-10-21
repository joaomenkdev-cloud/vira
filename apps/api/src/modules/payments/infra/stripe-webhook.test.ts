import type { PinoLogger } from "nestjs-pino";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../../platform/config/config.schema.js";
import type {
  TransactionContext,
  TransactionRunner,
} from "../../../platform/database/transaction.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { HandleStripeWebhook } from "../application/handle-stripe-webhook.js";
import { PaymentEvents, type SucceededPayment } from "../application/payment-events.js";
import { PaymentsUnavailableError } from "../application/payment-intents.js";
import type { ProcessedEvents } from "../application/ports/processed-events.js";
import { InvalidWebhookSignatureError } from "../application/ports/webhook-verifier.js";
import { StripeWebhookVerifier } from "./stripe-webhook-verifier.js";

// A fake signing secret: it names no Stripe endpoint (.gitleaks.toml).
const SECRET = "whsec_viraFakeWebhook000000";
const ORDER = "0192a0e4-2222-7000-8000-000000000001";
const T0 = new Date("2026-11-01T12:00:00Z");

/** A Stripe event as the webhook receives it: the raw body and its signature header. */
function signed(event: Record<string, unknown>, { secret = SECRET, ageSeconds = 0 } = {}) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: Math.floor(Date.now() / 1000) - ageSeconds,
  });
  return { body: Buffer.from(payload), header };
}

function succeeded(
  id = "evt_1QabcSucceeded",
  object: Record<string, unknown> = {
    id: "pi_3QabcDEF123",
    object: "payment_intent",
    amount: 24000,
    currency: "brl",
    metadata: { orderId: ORDER },
  },
) {
  return {
    id,
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    data: { object },
  };
}

/** Recorded event ids, kept only when the transaction commits. */
class InMemoryProcessed implements ProcessedEvents, TransactionRunner {
  ids = new Set<string>();

  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const snapshot = new Set(this.ids);
    try {
      return await work({} as TransactionContext);
    } catch (error) {
      this.ids = snapshot;
      throw error;
    }
  }

  record(eventId: string): Promise<boolean> {
    if (this.ids.has(eventId)) return Promise.resolve(false);
    this.ids.add(eventId);
    return Promise.resolve(true);
  }
}

function setup({ webhookSecret }: { webhookSecret?: string | null } = {}) {
  const clock = { now: () => T0 };
  let n = 0;
  const ids = { next: () => `0192a0e4-3333-7000-8000-${String(++n).padStart(12, "0")}` };
  const auditEntries: Record<string, unknown>[] = [];
  const audit = new AuditLog(
    {
      append: (entry: Record<string, unknown>) => {
        auditEntries.push(entry);
        return Promise.resolve();
      },
    } as never,
    clock,
    ids,
  );
  const processed = new InMemoryProcessed();
  const events = new PaymentEvents();
  const payments: SucceededPayment[] = [];
  const settled: string[] = [];
  let failing = false;
  events.onPaymentSucceeded((payment) => {
    if (failing) return Promise.reject(new Error("database down"));
    payments.push(payment);
    return Promise.resolve(() => {
      settled.push(payment.orderId);
      return Promise.resolve();
    });
  });
  const silent = { info: () => undefined, warn: () => undefined } as unknown as PinoLogger;
  const handler = new HandleStripeWebhook(
    new StripeWebhookVerifier(),
    processed,
    processed,
    clock,
    {
      payments: {
        mode: "test",
        stripe: undefined,
        webhookSecret: webhookSecret === null ? undefined : SECRET,
      },
    } as AppConfig,
    events,
    audit,
    silent,
  );
  return {
    handle: ({ body, header }: { body: Buffer; header: string }) => handler.execute(body, header),
    processed,
    payments,
    settled,
    auditEntries,
    fail: (value: boolean) => {
      failing = value;
    },
  };
}

describe("verifying a Stripe webhook", () => {
  const verifier = new StripeWebhookVerifier();

  it("answers the event when the signature is right", () => {
    const { body, header } = signed(succeeded());
    expect(verifier.verify(body, header, SECRET)).toMatchObject({ id: "evt_1QabcSucceeded" });
  });

  it("refuses a changed body, another secret, a replay and a malformed header", () => {
    const { body, header } = signed(succeeded());
    const changed = Buffer.from(body.toString().replace("24000", "100"));
    expect(() => verifier.verify(changed, header, SECRET)).toThrow(InvalidWebhookSignatureError);
    const other = signed(succeeded(), { secret: "whsec_viraFakeOther0000000" });
    expect(() => verifier.verify(other.body, other.header, SECRET)).toThrow(
      InvalidWebhookSignatureError,
    );
    const old = signed(succeeded(), { ageSeconds: 301 });
    expect(() => verifier.verify(old.body, old.header, SECRET)).toThrow(
      InvalidWebhookSignatureError,
    );
    expect(() => verifier.verify(body, "nonsense", SECRET)).toThrow(InvalidWebhookSignatureError);
  });
});

describe("handling a Stripe webhook", () => {
  it("applies a succeeded payment once, however many times Stripe sends it", async () => {
    const s = setup();
    const event = signed(succeeded());

    expect(await s.handle(event)).toBe("processed");
    expect(s.payments).toEqual([
      { paymentIntentId: "pi_3QabcDEF123", orderId: ORDER, amountCents: 24000, currency: "BRL" },
    ]);
    expect(s.settled).toEqual([ORDER]);
    expect(s.auditEntries).toEqual([
      expect.objectContaining({
        action: "payment.webhook_processed",
        actorRole: "SYSTEM",
        metadata: { stripeEventId: "evt_1QabcSucceeded", type: "payment_intent.succeeded" },
      }),
    ]);

    expect(await s.handle(event)).toBe("duplicate");
    expect(await s.handle(signed(succeeded()))).toBe("duplicate");
    expect(s.payments).toHaveLength(1);
    expect(s.auditEntries).toHaveLength(1);
  });

  it("refuses a bad signature before reading anything", async () => {
    const s = setup();
    const { body } = signed(succeeded());
    await expect(s.handle({ body, header: "t=1,v1=00" })).rejects.toThrow(
      InvalidWebhookSignatureError,
    );
    expect(s.processed.ids.size).toBe(0);
  });

  it("leaves the event unrecorded when applying it fails, so Stripe sends it again", async () => {
    const s = setup();
    const event = signed(succeeded());
    s.fail(true);
    await expect(s.handle(event)).rejects.toThrow("database down");
    expect(s.processed.ids.size).toBe(0);
    s.fail(false);
    expect(await s.handle(event)).toBe("processed");
    expect(s.payments).toHaveLength(1);
  });

  it("records the other handled types without touching an order", async () => {
    const s = setup();
    for (const [id, type] of [
      ["evt_1QabcFailed", "payment_intent.payment_failed"],
      ["evt_1QabcRefunded", "charge.refunded"],
    ] as const) {
      expect(await s.handle(signed({ ...succeeded(id), type }))).toBe("processed");
    }
    expect(s.payments).toEqual([]);
    expect([...s.processed.ids]).toEqual(["evt_1QabcFailed", "evt_1QabcRefunded"]);
  });

  it("ignores live events, other types and a PaymentIntent without an order", async () => {
    const s = setup();
    expect(await s.handle(signed({ ...succeeded(), livemode: true }))).toBe("ignored");
    expect(await s.handle(signed({ ...succeeded(), type: "customer.created" }))).toBe("ignored");
    const noOrder = succeeded("evt_1QabcNoOrder", {
      id: "pi_3QabcDEF123",
      amount: 24000,
      currency: "brl",
      metadata: {},
    });
    expect(await s.handle(signed(noOrder))).toBe("ignored");
    const dollars = succeeded("evt_1QabcDollars", {
      id: "pi_3QabcDEF123",
      amount: 24000,
      currency: "usd",
      metadata: { orderId: ORDER },
    });
    expect(await s.handle(signed(dollars))).toBe("ignored");
    expect(await s.handle(signed({ id: "not-an-event" }))).toBe("ignored");
    expect(s.payments).toEqual([]);
    expect(s.processed.ids.size).toBe(0);
  });

  it("says payments are off without a webhook secret", async () => {
    const s = setup({ webhookSecret: null });
    await expect(s.handle(signed(succeeded()))).rejects.toThrow(PaymentsUnavailableError);
  });
});

describe("the refund job", () => {
  it("refunds with the order's idempotency key", async () => {
    const { RefundPayment } = await import("../application/refund-payment.js");
    const calls: string[][] = [];
    const refund = new RefundPayment({
      createPaymentIntent: () => Promise.reject(new Error("unused")),
      retrievePaymentIntent: () => Promise.reject(new Error("unused")),
      refundPaymentIntent: (pi, key) => {
        calls.push([pi, key]);
        return Promise.resolve();
      },
    });
    await refund.execute(ORDER, "pi_3QabcDEF123");
    expect(calls).toEqual([["pi_3QabcDEF123", `refund:${ORDER}`]]);
  });
});
