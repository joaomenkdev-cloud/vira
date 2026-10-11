import { describe, expect, it } from "vitest";

import config from "../../next.config";
import { resolveApiOrigin } from "./api-origin";
import { securityHeaders } from "./security-headers";

describe("next.config", () => {
  it("proxies /api/v1 to the API before any page can match", async () => {
    const rewrites = await config.rewrites?.();
    expect(rewrites).toEqual({
      beforeFiles: [
        {
          source: "/api/v1/:path*",
          destination: `${resolveApiOrigin(process.env)}/api/v1/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    });
  });

  it("sends the security headers on every path", async () => {
    const headers = await config.headers?.();
    expect(headers).toHaveLength(1);
    expect(headers?.[0]?.source).toBe("/:path*");
    expect(headers?.[0]?.headers).toEqual(securityHeaders);
  });

  it("does not advertise the framework", () => {
    expect(config.poweredByHeader).toBe(false);
  });
});

describe("security headers", () => {
  const byKey = new Map(securityHeaders.map((h) => [h.key, h.value]));

  it("enforce HTTPS, forbid sniffing and framing, and limit referrers", () => {
    expect(byKey.get("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("turn off powerful browser features nothing uses yet", () => {
    const policy = byKey.get("Permissions-Policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });
});
