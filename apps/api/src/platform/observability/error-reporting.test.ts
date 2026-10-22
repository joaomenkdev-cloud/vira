import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";

import { EMAIL_MASK, scrubEvent } from "./error-reporting.js";

const event: ErrorEvent = {
  type: undefined,
  event_id: "e1",
  release: "0123abc",
  environment: "production",
  server_name: "srv-123.render.internal",
  message: "Could not mail ana.souza@example.com",
  tags: { service: "api" },
  user: { id: "u1", email: "ana.souza@example.com", ip_address: "203.0.113.9" },
  request: {
    url: "https://api.vira.example/api/v1/me?email=ana.souza@example.com",
    query_string: "email=ana.souza@example.com",
    cookies: { vira_refresh: "secret" },
    headers: { authorization: "Bearer secret" },
    data: { password: "hunter2" },
  },
  extra: { holderName: "Ana Souza" },
  breadcrumbs: [{ message: "POST /auth/login ana.souza@example.com" }],
  exception: {
    values: [
      {
        type: "SmtpError",
        value: "Recipient <ana.souza@example.com> rejected",
        stacktrace: {
          frames: [{ filename: "mailer.js", lineno: 10, vars: { to: "ana.souza@example.com" } }],
        },
      },
    ],
  },
};

describe("scrubEvent", () => {
  const scrubbed = scrubEvent(event);

  it("drops everything that may say who was involved", () => {
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).not.toHaveProperty("vars");
  });

  it("masks e-mail addresses in the messages", () => {
    expect(scrubbed.message).toBe(`Could not mail ${EMAIL_MASK}`);
    expect(scrubbed.exception?.values?.[0]?.value).toBe(`Recipient <${EMAIL_MASK}> rejected`);
  });

  it("keeps what explains the error", () => {
    expect(scrubbed).toMatchObject({
      event_id: "e1",
      release: "0123abc",
      environment: "production",
      tags: { service: "api" },
    });
    expect(scrubbed.exception?.values?.[0]).toMatchObject({
      type: "SmtpError",
      stacktrace: { frames: [{ filename: "mailer.js", lineno: 10 }] },
    });
  });

  it("leaves no personal data anywhere in the event", () => {
    const serialized = JSON.stringify(scrubbed);
    for (const value of ["ana.souza", "Ana Souza", "hunter2", "secret", "203.0.113.9"]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("does not change the event it was given", () => {
    expect(event.user?.email).toBe("ana.souza@example.com");
  });
});
