import type { NextConfig } from "next";

import { isLoopback, resolveApiOrigin, resolveStorageOrigin } from "./src/config/api-origin";
import { securityHeaders } from "./src/config/security-headers";

const apiOrigin = resolveApiOrigin(process.env);
const storageOrigin = new URL(resolveStorageOrigin(process.env));

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  // Event photos are signed addresses on the object storage (the bucket is private).
  // `next/image` resizes them on this origin, so the browser never loads the bucket
  // directly and the CSP keeps `img-src 'self'`. Locally the storage is on the loopback
  // interface, which the optimizer refuses unless told otherwise.
  images: {
    remotePatterns: [
      {
        protocol: storageOrigin.protocol === "https:" ? "https" : "http",
        hostname: storageOrigin.hostname,
        port: storageOrigin.port,
        pathname: "/**",
      },
    ],
    dangerouslyAllowLocalIP: isLoopback(storageOrigin.origin),
    // The photos are WebP already (N9); AVIF would cost the optimizer more than it saves.
    formats: ["image/webp"],
  },

  // The browser calls /api/v1/* on this origin; Next forwards it to the API, so the
  // session cookies are first-party and no CORS is involved (ADR-0005).
  rewrites() {
    return Promise.resolve({
      beforeFiles: [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }],
      afterFiles: [],
      fallback: [],
    });
  },

  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: securityHeaders.map(({ key, value }) => ({ key, value })) },
    ]);
  },
};

export default config;
