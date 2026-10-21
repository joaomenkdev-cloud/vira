import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PaymentGatewayError } from "../application/ports/payment-gateway.js";
import { StripePaymentGateway } from "./stripe-payment-gateway.js";

// A fake key: it names no Stripe account (.gitleaks.toml).
const SECRET_KEY = "sk_test_viraFakeSecret000000";
const ORDER_ID = "0192a0e4-2222-7000-8000-000000000001";

interface Recorded {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly headers: IncomingMessage["headers"];
  readonly body: URLSearchParams;
}

const intent = (overrides: Record<string, unknown> = {}) => ({
  id: "pi_3QabcDEF123",
  object: "payment_intent",
  client_secret: "pi_3QabcDEF123_secret_viraFake0",
  amount: 41000,
  currency: "brl",
  livemode: false,
  status: "requires_payment_method",
  metadata: { orderId: ORDER_ID },
  ...overrides,
});

/** Stripe's API as the SDK sees it: records each request and answers what the test set. */
describe("StripePaymentGateway", () => {
  let server: Server;
  let gateway: StripePaymentGateway;
  const requests: Recorded[] = [];
  let reply: { status: number; body: unknown } = { status: 200, body: intent() };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      req.on("end", () => {
        requests.push({
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: new URLSearchParams(raw),
        });
        res.writeHead(reply.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    gateway = new StripePaymentGateway(
      new Stripe(SECRET_KEY, {
        host: "127.0.0.1",
        port,
        protocol: "http",
        maxNetworkRetries: 0,
        telemetry: false,
      }),
    );
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    requests.length = 0;
    reply = { status: 200, body: intent() };
  });

  it("creates the PaymentIntent with the amount given, the order id and the idempotency key", async () => {
    const created = await gateway.createPaymentIntent({
      orderId: ORDER_ID,
      amountCents: 41000,
      currency: "BRL",
      idempotencyKey: `pi:${ORDER_ID}`,
    });

    expect(created).toEqual({
      id: "pi_3QabcDEF123",
      clientSecret: "pi_3QabcDEF123_secret_viraFake0",
      amountCents: 41000,
      status: "requires_payment_method",
    });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/v1/payment_intents");
    expect(request?.headers.authorization).toBe(`Bearer ${SECRET_KEY}`);
    expect(request?.headers["idempotency-key"]).toBe(`pi:${ORDER_ID}`);
    expect(Object.fromEntries(request?.body ?? [])).toEqual({
      amount: "41000",
      currency: "brl",
      "automatic_payment_methods[enabled]": "true",
      "metadata[orderId]": ORDER_ID,
    });
  });

  it("retrieves a PaymentIntent by id", async () => {
    expect((await gateway.retrievePaymentIntent("pi_3QabcDEF123")).clientSecret).toBe(
      "pi_3QabcDEF123_secret_viraFake0",
    );
    expect(requests.map((r) => [r.method, r.path])).toEqual([
      ["GET", "/v1/payment_intents/pi_3QabcDEF123"],
    ]);
  });

  it("refuses an answer it does not expect, such as a live-mode PaymentIntent", async () => {
    for (const body of [intent({ livemode: true }), intent({ currency: "usd" }), { id: 1 }]) {
      reply = { status: 200, body };
      await expect(gateway.retrievePaymentIntent("pi_3QabcDEF123")).rejects.toThrow(
        new PaymentGatewayError("unexpected response"),
      );
    }
  });

  it("reports Stripe's errors by type, without their message", async () => {
    reply = {
      status: 400,
      body: { error: { type: "invalid_request_error", message: "No such payment_intent" } },
    };
    const error = await gateway.retrievePaymentIntent("pi_missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentGatewayError);
    expect((error as PaymentGatewayError).reason).toBe("StripeInvalidRequestError");
  });

  it("fails when Stripe cannot be reached", async () => {
    const offline = new StripePaymentGateway(
      new Stripe(SECRET_KEY, {
        host: "127.0.0.1",
        port: 1,
        protocol: "http",
        maxNetworkRetries: 0,
      }),
    );
    await expect(offline.retrievePaymentIntent("pi_3QabcDEF123")).rejects.toThrow(
      PaymentGatewayError,
    );
  });
});
