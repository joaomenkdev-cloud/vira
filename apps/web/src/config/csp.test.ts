import { describe, expect, it } from "vitest";

import { buildCsp, generateNonce } from "./csp";

function directive(csp: string, name: string): string[] {
  const entry = csp.split("; ").find((part) => part.startsWith(`${name} `) || part === name);
  return entry ? entry.split(" ").slice(1) : [];
}

describe("generateNonce", () => {
  it("is different on every call and safe to place in a header", () => {
    const nonces = Array.from({ length: 50 }, generateNonce);
    expect(new Set(nonces).size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("buildCsp (production)", () => {
  const csp = buildCsp({ nonce: "abc123", isDevelopment: false });

  it("only runs scripts that carry the nonce", () => {
    expect(directive(csp, "script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it("never allows eval or inline scripts and styles", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
    expect(directive(csp, "style-src")).toEqual(["'self'", "'nonce-abc123'"]);
  });

  it("forbids framing, plugins, base tag changes and cross-origin form posts", () => {
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'none'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  it("keeps every other resource type on the same origin", () => {
    for (const name of ["default-src", "connect-src", "font-src"]) {
      expect(directive(csp, name)).toEqual(["'self'"]);
    }
    expect(directive(csp, "img-src")).toEqual(["'self'", "blob:", "data:"]);
  });

  it("upgrades insecure requests", () => {
    expect(csp.split("; ")).toContain("upgrade-insecure-requests");
  });
});

describe("buildCsp (development)", () => {
  const csp = buildCsp({ nonce: "abc123", isDevelopment: true });

  it("allows eval and inline styles for React debugging and hot reload", () => {
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "style-src")).toContain("'unsafe-inline'");
  });

  it("does not upgrade requests, which would break the plain-http dev server", () => {
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
