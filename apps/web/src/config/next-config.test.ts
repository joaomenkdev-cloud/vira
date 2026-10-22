import { describe, expect, it } from "vitest";

import config from "../../next.config";
import { isLoopback, resolveApiOrigin, resolveStorageOrigin } from "./api-origin";
import { checkinHeaders, securityHeaders } from "./security-headers";

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

  it("sends the security headers on every path, and the camera only on the door", async () => {
    const headers = await config.headers?.();
    expect(headers).toHaveLength(2);
    expect(headers?.[0]?.source).toBe("/:path*");
    expect(headers?.[0]?.headers).toEqual(securityHeaders);
    // Last, so its Permissions-Policy replaces the general one on that path.
    expect(headers?.[1]?.source).toBe("/painel/eventos/:id/check-in");
    expect(headers?.[1]?.headers).toEqual(checkinHeaders);
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

describe("check-in headers", () => {
  it("allow the camera to the page itself, and nothing else", () => {
    const policy = checkinHeaders.find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(policy).toContain("camera=(self)");
    for (const feature of ["microphone", "geolocation", "payment"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });
});

describe("images", () => {
  it("optimizes only the photos of the object storage", () => {
    const storage = new URL(resolveStorageOrigin(process.env));
    expect(config.images?.remotePatterns).toEqual([
      {
        protocol: storage.protocol.replace(":", ""),
        hostname: storage.hostname,
        port: storage.port,
        pathname: "/**",
      },
    ]);
  });

  it("reaches a loopback address only when the storage itself is local", () => {
    expect(config.images?.dangerouslyAllowLocalIP).toBe(
      isLoopback(resolveStorageOrigin(process.env)),
    );
  });
});
