import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { PinoLogger } from "nestjs-pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../../../../platform/config/config.schema.js";
import { PwnedPasswords, rangeIncludes, rangeOf } from "./pwned-passwords.js";

const LEAKED = "password123";
const SAFE = "a passphrase nobody has used";

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex").toUpperCase();
}

describe("rangeOf", () => {
  it("splits the upper-case SHA-1 after five digits", () => {
    // Known vector from the Pwned Passwords documentation: SHA-1("P@ssw0rd").
    expect(rangeOf("P@ssw0rd")).toEqual({
      prefix: "21BD1",
      suffix: "2DC183F740EE76F27B78EB39C8AD972A757",
    });
  });
});

describe("rangeIncludes", () => {
  const suffix = rangeOf(LEAKED).suffix;

  it("finds the suffix with a positive count, across line endings", () => {
    expect(
      rangeIncludes(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${suffix}:2254650\r\n`, suffix),
    ).toBe(true);
  });

  it("ignores padding entries (count 0), other suffixes and garbage", () => {
    expect(rangeIncludes(`${suffix}:0\n`, suffix)).toBe(false);
    expect(rangeIncludes("0018A45C4D1DEF81644B54AB7F969B88D65:3\n", suffix)).toBe(false);
    expect(rangeIncludes(`<html>${suffix}:5</html>`, suffix)).toBe(false);
    expect(rangeIncludes("", suffix)).toBe(false);
  });
});

/** A stand-in for api.pwnedpasswords.com that knows one leaked password. */
class FakeRangeApi {
  readonly requests: { url: string; headers: IncomingHttpHeaders }[] = [];
  answer: (prefix: string) => { status: number; body: string; delayMs?: number } = (prefix) => {
    const lines = ["0018A45C4D1DEF81644B54AB7F969B88D65:1"];
    const leaked = rangeOf(LEAKED);
    if (prefix === leaked.prefix) lines.push(`${leaked.suffix}:2254650`);
    lines.push(`${rangeOf(SAFE).suffix}:0`); // padding may even name the safe suffix
    return { status: 200, body: lines.join("\r\n") };
  };
  private server: Server | undefined;
  baseUrl = "";

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      this.requests.push({ url: request.url ?? "", headers: request.headers });
      const prefix = /^\/range\/([0-9A-F]{5})$/.exec(request.url ?? "")?.[1] ?? "";
      const { status, body, delayMs = 0 } = this.answer(prefix);
      setTimeout(() => {
        response.writeHead(status, { "Content-Type": "text/plain" });
        response.end(body);
      }, delayMs);
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.server?.close(() => {
        resolve();
      });
    });
  }
}

describe("PwnedPasswords", () => {
  const api = new FakeRangeApi();
  const warnings: unknown[] = [];
  const logger = { warn: (...args: unknown[]) => warnings.push(args) } as unknown as PinoLogger;
  let pwned: PwnedPasswords;
  const defaultAnswer = api.answer;

  beforeAll(async () => {
    await api.start();
    pwned = new PwnedPasswords(
      { auth: { pwnedPasswords: { enabled: true, baseUrl: api.baseUrl } } } as AppConfig,
      logger,
    );
  });

  afterAll(async () => {
    await api.stop();
  });

  beforeEach(() => {
    api.requests.length = 0;
    warnings.length = 0;
    api.answer = defaultAnswer;
  });

  it("recognizes a leaked password and accepts an unknown one", async () => {
    expect(await pwned.includes(LEAKED)).toBe(true);
    expect(await pwned.includes(SAFE)).toBe(false);
  });

  it("sends only the five-digit prefix of the hash, with padding requested", async () => {
    await pwned.includes(LEAKED);

    const [request] = api.requests;
    expect(request?.url).toBe(`/range/${sha1(LEAKED).slice(0, 5)}`);
    expect(request?.headers["add-padding"]).toBe("true");
    expect(request?.headers["user-agent"]).toBe("vira-api");
    // Neither the password nor the rest of its hash travels anywhere.
    const sent = JSON.stringify(request);
    expect(sent).not.toContain(LEAKED);
    expect(sent).not.toContain(sha1(LEAKED).slice(5));
  });

  it.each([
    ["an error status", () => ({ status: 503, body: "busy" })],
    ["an answer too large", () => ({ status: 200, body: "A".repeat(300 * 1024) })],
  ])("accepts the password and logs a warning on %s", async (_case, answer) => {
    api.answer = answer;
    expect(await pwned.includes(LEAKED)).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings)).not.toContain(sha1(LEAKED).slice(0, 5));
  });

  it("gives up after the timeout and accepts the password", async () => {
    api.answer = () => ({ status: 200, body: `${rangeOf(LEAKED).suffix}:9`, delayMs: 3_500 });
    const started = Date.now();
    expect(await pwned.includes(LEAKED)).toBe(false);
    expect(Date.now() - started).toBeLessThan(3_400);
    expect(warnings).toHaveLength(1);
  }, 10_000);
});
