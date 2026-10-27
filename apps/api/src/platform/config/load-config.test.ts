import { describe, expect, it } from "vitest";

import { ConfigValidationError, loadConfig } from "./load-config.js";

const validEnv = {
  WEB_ORIGIN: "http://localhost:3001",
  DATABASE_URL: "postgresql://vira:vira_local@127.0.0.1:5432/vira",
  REDIS_URL: "redis://127.0.0.1:6379",
  SMTP_URL: "smtp://127.0.0.1:1025",
  S3_ENDPOINT: "http://127.0.0.1:8333/",
  S3_BUCKET: "vira-events",
  S3_ACCESS_KEY_ID: "vira-local",
  S3_SECRET_ACCESS_KEY: "vira-local-secret",
  JWT_SECRET: "a".repeat(43),
  CSRF_SECRET: "b".repeat(43),
  QR_SIGNING_KEYS: `q1:${"q".repeat(43)}`,
};

// Fake keys: they name no Stripe account (.gitleaks.toml).
const stripeTestKeys = {
  STRIPE_SECRET_KEY: "sk_test_viraFakeSecret000000",
  STRIPE_PUBLISHABLE_KEY: "pk_test_viraFakePublishable0",
  STRIPE_WEBHOOK_SECRET: "whsec_viraFakeWebhook000000",
};

const productionEnv = {
  NODE_ENV: "production",
  WEB_ORIGIN: "https://vira.example",
  DATABASE_URL: "postgresql://vira:pw@db.example/vira?sslmode=require",
  REDIS_URL: "rediss://default:pw@cache.example:6379",
  SMTP_URL: "smtps://resend:pw@smtp.example:465",
  MAIL_FROM: "Vira <no-reply@vira.example>",
  S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  S3_BUCKET: "vira-events",
  S3_ACCESS_KEY_ID: "key-id",
  S3_SECRET_ACCESS_KEY: "key-secret",
  JWT_SECRET: "c".repeat(44),
  CSRF_SECRET: "d".repeat(44),
  QR_SIGNING_KEYS: `p1:${"p".repeat(44)}`,
  ...stripeTestKeys,
};

function captureError(env: NodeJS.ProcessEnv): ConfigValidationError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigValidationError) return error;
    throw error;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("applies defaults for optional variables", () => {
    expect(loadConfig(validEnv)).toEqual({
      env: "development",
      http: { host: "0.0.0.0", port: 3000, webOrigin: "http://localhost:3001", trustProxyHops: 0 },
      log: { level: "info", pretty: true },
      errorReporting: undefined,
      docs: { enabled: true },
      database: { url: validEnv.DATABASE_URL },
      redis: { url: validEnv.REDIS_URL },
      mail: { smtpUrl: validEnv.SMTP_URL, from: "Vira <no-reply@vira.localhost>" },
      storage: {
        endpoint: "http://127.0.0.1:8333",
        region: "auto",
        bucket: "vira-events",
        accessKeyId: "vira-local",
        secretAccessKey: "vira-local-secret",
      },
      payments: { mode: "test", stripe: undefined, webhookSecret: undefined },
      tickets: { qrSigningKeys: [{ kid: "q1", key: Buffer.from("q".repeat(43), "base64") }] },
      worker: { mode: "separate", outboxPollIntervalMs: 5_000 },
      auth: {
        jwtSecret: validEnv.JWT_SECRET,
        csrfSecret: validEnv.CSRF_SECRET,
        oauth: { google: undefined, github: undefined },
        pwnedPasswords: { enabled: true, baseUrl: "https://api.pwnedpasswords.com" },
      },
    });
  });

  it("parses typed values from strings", () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: "test",
      PORT: "8080",
      TRUST_PROXY_HOPS: "1",
      API_DOCS_ENABLED: "false",
      LOG_LEVEL: "warn",
    });
    expect(config.http.port).toBe(8080);
    expect(config.http.trustProxyHops).toBe(1);
    expect(config.docs.enabled).toBe(false);
    expect(config.log).toEqual({ level: "warn", pretty: false });
  });

  it("treats a variable set to nothing as unset", () => {
    const config = loadConfig({
      ...validEnv,
      LOG_LEVEL: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: " ",
      SENTRY_DSN: "",
    });
    expect(config.log.level).toBe("info");
    expect(config.auth.oauth.google).toBeUndefined();
    expect(config.errorReporting).toBeUndefined();
    expect(captureError({ ...validEnv, DATABASE_URL: "" }).message).toContain("DATABASE_URL");
  });

  it("normalizes the web origin", () => {
    const config = loadConfig({ ...validEnv, WEB_ORIGIN: "https://vira.example/some/path" });
    expect(config.http.webOrigin).toBe("https://vira.example");
  });

  it("turns error reporting on with a DSN, defaulting the environment and the release", () => {
    const dsn = "https://public@o1.ingest.sentry.io/1";
    expect(loadConfig({ ...validEnv, SENTRY_DSN: dsn }).errorReporting).toEqual({
      dsn,
      environment: "development",
      release: undefined,
    });
    expect(
      loadConfig({ ...validEnv, SENTRY_DSN: dsn, RENDER_GIT_COMMIT: "0123abc" }).errorReporting,
    ).toEqual({ dsn, environment: "development", release: "0123abc" });
    expect(
      loadConfig({
        ...validEnv,
        SENTRY_DSN: dsn,
        SENTRY_ENVIRONMENT: "staging",
        SENTRY_RELEASE: "vira@1.0.0",
        RENDER_GIT_COMMIT: "0123abc",
      }).errorReporting,
    ).toEqual({ dsn, environment: "staging", release: "vira@1.0.0" });
    expect(
      captureError({ ...validEnv, SENTRY_DSN: "http://public@o1.ingest.sentry.io/1" }).message,
    ).toContain("SENTRY_DSN");
  });

  it("reads the worker mode and the outbox polling interval", () => {
    const config = loadConfig({
      ...validEnv,
      WORKER_MODE: "embedded",
      OUTBOX_POLL_INTERVAL_MS: "250",
    });
    expect(config.worker).toEqual({ mode: "embedded", outboxPollIntervalMs: 250 });
  });

  it("rejects an unknown worker mode and a polling interval that would hammer Redis", () => {
    const error = captureError({
      ...validEnv,
      WORKER_MODE: "inline",
      OUTBOX_POLL_INTERVAL_MS: "5",
    });
    expect(error.issues.map((i) => i.variable).sort()).toEqual([
      "OUTBOX_POLL_INTERVAL_MS",
      "WORKER_MODE",
    ]);
  });

  it("rejects connection strings for the wrong service", () => {
    const error = captureError({
      ...validEnv,
      DATABASE_URL: "mysql://vira@db/vira",
      REDIS_URL: "http://cache.example",
      SMTP_URL: "http://mail.example",
    });
    expect(error.issues.map((i) => i.variable).sort()).toEqual([
      "DATABASE_URL",
      "REDIS_URL",
      "SMTP_URL",
    ]);
  });

  it("requires the object storage and checks the bucket name", () => {
    const { S3_ENDPOINT: _endpoint, ...withoutEndpoint } = validEnv;
    expect(captureError(withoutEndpoint).issues.map((i) => i.variable)).toEqual(["S3_ENDPOINT"]);
    expect(
      captureError({ ...validEnv, S3_BUCKET: "Vira_Events" }).issues.map((i) => i.variable),
    ).toEqual(["S3_BUCKET"]);
    expect(
      captureError({ ...validEnv, S3_ENDPOINT: "ftp://storage.example" }).issues.map(
        (i) => i.variable,
      ),
    ).toEqual(["S3_ENDPOINT"]);
  });

  it("reads the mail settings", () => {
    const config = loadConfig({ ...validEnv, MAIL_FROM: "ola@vira.example" });
    expect(config.mail).toEqual({ smtpUrl: validEnv.SMTP_URL, from: "ola@vira.example" });
  });

  it("rejects a sender that is not an address", () => {
    for (const from of ["not an address", "Vira <>", "a@b\r\nBcc: c@d"]) {
      const error = captureError({ ...validEnv, MAIL_FROM: from });
      expect(error.issues.map((i) => i.variable)).toEqual(["MAIL_FROM"]);
    }
  });

  it("requires 256-bit signing secrets, one per purpose", () => {
    const short = captureError({ ...validEnv, JWT_SECRET: "x".repeat(42), CSRF_SECRET: "" });
    expect(short.issues.map((i) => i.variable).sort()).toEqual(["CSRF_SECRET", "JWT_SECRET"]);

    const shared = captureError({ ...validEnv, CSRF_SECRET: validEnv.JWT_SECRET });
    expect(shared.issues).toEqual([
      { variable: "CSRF_SECRET", message: "must differ from JWT_SECRET" },
    ]);
  });

  it("turns on each social login provider that has both credentials", () => {
    const config = loadConfig({
      ...validEnv,
      GOOGLE_CLIENT_ID: " google-id.apps.googleusercontent.com ",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });
    expect(config.auth.oauth).toEqual({
      google: { clientId: "google-id.apps.googleusercontent.com", clientSecret: "google-secret" },
      github: undefined,
    });
  });

  it("checks leaked passwords by default, except in tests", () => {
    expect(loadConfig(validEnv).auth.pwnedPasswords.enabled).toBe(true);
    expect(loadConfig({ ...validEnv, NODE_ENV: "test" }).auth.pwnedPasswords.enabled).toBe(false);
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: "test",
      PWNED_PASSWORDS_ENABLED: "true",
      PWNED_PASSWORDS_URL: "http://127.0.0.1:9999/",
    });
    expect(config.auth.pwnedPasswords).toEqual({ enabled: true, baseUrl: "http://127.0.0.1:9999" });
    expect(captureError({ ...validEnv, PWNED_PASSWORDS_URL: "ftp://x" }).issues).toEqual([
      expect.objectContaining({ variable: "PWNED_PASSWORDS_URL" }),
    ]);
  });

  it("refuses half of a provider's credentials", () => {
    const error = captureError({
      ...validEnv,
      GOOGLE_CLIENT_ID: "google-id",
      GITHUB_CLIENT_SECRET: "github-secret",
    });
    expect(error.issues).toEqual([
      { variable: "GOOGLE_CLIENT_SECRET", message: "must be set together with GOOGLE_CLIENT_ID" },
      { variable: "GITHUB_CLIENT_ID", message: "must be set together with GITHUB_CLIENT_SECRET" },
    ]);
  });

  describe("Stripe", () => {
    it("takes a pair of test-mode keys", () => {
      expect(loadConfig({ ...validEnv, ...stripeTestKeys }).payments).toEqual({
        mode: "test",
        stripe: {
          secretKey: stripeTestKeys.STRIPE_SECRET_KEY,
          publishableKey: stripeTestKeys.STRIPE_PUBLISHABLE_KEY,
        },
        webhookSecret: stripeTestKeys.STRIPE_WEBHOOK_SECRET,
      });
      expect(
        captureError({ ...validEnv, STRIPE_WEBHOOK_SECRET: "sk_test_viraFakeSecret000000" }).issues,
      ).toEqual([
        {
          variable: "STRIPE_WEBHOOK_SECRET",
          message: "must be a webhook signing secret (whsec_...)",
        },
      ]);
    });

    it("refuses to start with live keys", () => {
      const error = captureError({
        ...validEnv,
        STRIPE_SECRET_KEY: "sk_live_viraFakeSecret000000",
        STRIPE_PUBLISHABLE_KEY: "pk_live_viraFakePublishable0",
      });
      expect(error.issues).toEqual([
        {
          variable: "STRIPE_SECRET_KEY",
          message: "live keys are refused: PAYMENTS_MODE=test accepts only test-mode keys",
        },
        {
          variable: "STRIPE_PUBLISHABLE_KEY",
          message: "live keys are refused: PAYMENTS_MODE=test accepts only test-mode keys",
        },
      ]);
      expect(error.message).not.toContain("viraFake");
      expect(
        captureError({
          ...validEnv,
          ...stripeTestKeys,
          STRIPE_SECRET_KEY: "rk_live_viraFakeRestricted00",
        }).issues.map((i) => i.variable),
      ).toEqual(["STRIPE_SECRET_KEY"]);
      expect(
        captureError({ ...validEnv, ...stripeTestKeys, PAYMENTS_MODE: "live" }).issues.map(
          (i) => i.variable,
        ),
      ).toEqual(["PAYMENTS_MODE"]);
    });

    it("refuses keys swapped or alone", () => {
      expect(
        captureError({
          ...validEnv,
          STRIPE_SECRET_KEY: stripeTestKeys.STRIPE_PUBLISHABLE_KEY,
          STRIPE_PUBLISHABLE_KEY: stripeTestKeys.STRIPE_SECRET_KEY,
        }).issues,
      ).toEqual([
        { variable: "STRIPE_SECRET_KEY", message: "must be a test-mode key (sk_test_...)" },
        { variable: "STRIPE_PUBLISHABLE_KEY", message: "must be a test-mode key (pk_test_...)" },
      ]);
      expect(
        captureError({ ...validEnv, STRIPE_SECRET_KEY: stripeTestKeys.STRIPE_SECRET_KEY }).issues,
      ).toEqual([
        {
          variable: "STRIPE_PUBLISHABLE_KEY",
          message: "STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY must be set together",
        },
      ]);
    });
  });

  describe("in production", () => {
    it("accepts encrypted connections and disables the API docs by default", () => {
      expect(loadConfig(productionEnv).docs.enabled).toBe(false);
    });

    it("requires https for the web origin", () => {
      const error = captureError({ ...productionEnv, WEB_ORIGIN: "http://vira.example" });
      expect(error.issues).toEqual([
        { variable: "WEB_ORIGIN", message: "must use https in production" },
      ]);
    });

    it("requires TLS to the database", () => {
      for (const url of [
        "postgresql://vira:pw@db.example/vira",
        "postgresql://vira:pw@db.example/vira?sslmode=prefer",
      ]) {
        const error = captureError({ ...productionEnv, DATABASE_URL: url });
        expect(error.issues.map((i) => i.variable)).toEqual(["DATABASE_URL"]);
      }
    });

    it("requires TLS to the object storage", () => {
      expect(
        captureError({ ...productionEnv, S3_ENDPOINT: "http://storage.example" }).issues,
      ).toEqual([{ variable: "S3_ENDPOINT", message: "must use https in production" }]);
    });

    it("requires TLS to the mail server and an explicit sender", () => {
      const insecure = captureError({ ...productionEnv, SMTP_URL: "smtp://mail.example:587" });
      expect(insecure.issues).toEqual([
        { variable: "SMTP_URL", message: "must use smtps:// or set requireTLS=true in production" },
      ]);
      expect(
        loadConfig({ ...productionEnv, SMTP_URL: "smtp://mail.example:587?requireTLS=true" }).mail,
      ).toMatchObject({ smtpUrl: "smtp://mail.example:587?requireTLS=true" });

      const { MAIL_FROM: _omitted, ...withoutSender } = productionEnv;
      expect(captureError(withoutSender).issues).toEqual([
        { variable: "MAIL_FROM", message: "is required in production" },
      ]);
    });

    it("requires the Stripe keys and the webhook secret", () => {
      const {
        STRIPE_SECRET_KEY: _secret,
        STRIPE_PUBLISHABLE_KEY: _publishable,
        STRIPE_WEBHOOK_SECRET: _webhook,
        ...withoutStripe
      } = productionEnv;
      expect(captureError(withoutStripe).issues).toEqual([
        { variable: "STRIPE_SECRET_KEY", message: "is required in production" },
        { variable: "STRIPE_WEBHOOK_SECRET", message: "is required in production" },
      ]);
    });

    it("requires TLS to Redis", () => {
      const error = captureError({ ...productionEnv, REDIS_URL: "redis://cache.example:6379" });
      expect(error.issues).toEqual([
        { variable: "REDIS_URL", message: "must use rediss:// in production" },
      ]);
    });
  });

  it("reads the QR signing keys, the first one signing, and refuses weak or malformed ones", () => {
    const old = Buffer.alloc(32, 1).toString("base64");
    const current = Buffer.alloc(48, 2).toString("base64url");
    expect(
      loadConfig({ ...validEnv, QR_SIGNING_KEYS: `k2:${current}, k1:${old}` }).tickets,
    ).toEqual({
      qrSigningKeys: [
        { kid: "k2", key: Buffer.alloc(48, 2) },
        { kid: "k1", key: Buffer.alloc(32, 1) },
      ],
    });
    for (const value of [
      "",
      `k1:${Buffer.alloc(31).toString("base64")}`,
      `K1:${old}`,
      `k1:${old},k1:${old}`,
      `k1:${old}:extra`,
      `k1:not base64!`,
    ]) {
      const error = captureError({ ...validEnv, QR_SIGNING_KEYS: value });
      expect(error.issues.map((i) => i.variable)).toEqual(["QR_SIGNING_KEYS"]);
      expect(JSON.stringify(error.issues)).not.toContain(old);
    }
  });

  it("reports every invalid variable at once", () => {
    const error = captureError({ PORT: "0", LOG_LEVEL: "verbose" });
    expect(error.issues.map((i) => i.variable).sort()).toEqual([
      "CSRF_SECRET",
      "DATABASE_URL",
      "JWT_SECRET",
      "LOG_LEVEL",
      "PORT",
      "QR_SIGNING_KEYS",
      "REDIS_URL",
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_SECRET_ACCESS_KEY",
      "SMTP_URL",
      "WEB_ORIGIN",
    ]);
  });

  it("never echoes the offending values, which may be secrets", () => {
    const secret = "s3cr3t-value-that-must-not-leak";
    const error = captureError({
      WEB_ORIGIN: secret,
      PORT: secret,
      LOG_LEVEL: secret,
      DATABASE_URL: `mysql://vira:${secret}@db/vira`,
      REDIS_URL: secret,
      SMTP_URL: `ftp://mail:${secret}@mail.example`,
      JWT_SECRET: secret,
      CSRF_SECRET: secret,
    });
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error.issues)).not.toContain(secret);
  });

  it("never echoes database passwords from production rule failures", () => {
    const error = captureError({
      ...productionEnv,
      DATABASE_URL: "postgresql://vira:hunter2@db.example/vira",
    });
    expect(error.message).not.toContain("hunter2");
  });
});
