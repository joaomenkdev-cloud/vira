import * as Sentry from "@sentry/node";
import { afterAll, describe, expect, it } from "vitest";

import type { AppConfig } from "../config/config.schema.js";
import { initErrorReporting, reportError } from "./error-reporting.js";

const sent: string[] = [];
const decoder = new TextDecoder();

const config = {
  errorReporting: {
    dsn: "https://public@o1.ingest.sentry.io/1",
    environment: "test",
    release: "0123abc",
  },
} as AppConfig;

describe("error reporting", () => {
  afterAll(async () => {
    await Sentry.close();
  });

  it("sends errors through beforeSend, without personal data", async () => {
    const on = initErrorReporting(config, "api", {
      transport: (options) =>
        Sentry.createTransport(options, (request) => {
          sent.push(typeof request.body === "string" ? request.body : decoder.decode(request.body));
          return Promise.resolve({ statusCode: 200 });
        }),
    });
    expect(on).toBe(true);

    // Whatever some code may add to the scope never leaves the process.
    Sentry.setUser({ id: "u1", email: "ana.souza@example.com" });
    Sentry.setExtra("holderName", "Ana Souza");
    reportError(new Error("Recipient ana.souza@example.com rejected"), { queue: "mail" });
    await Sentry.flush(2_000);

    expect(sent).toHaveLength(1);
    const envelope = sent[0] ?? "";
    expect(envelope).toContain("Recipient [email] rejected");
    expect(envelope).toContain('"service":"api"');
    expect(envelope).toContain('"queue":"mail"');
    expect(envelope).toContain('"release":"0123abc"');
    expect(envelope).not.toContain("ana.souza");
    expect(envelope).not.toContain("Ana Souza");
  });
});
