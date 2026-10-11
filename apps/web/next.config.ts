import type { NextConfig } from "next";

import { resolveApiOrigin } from "./src/config/api-origin";
import { securityHeaders } from "./src/config/security-headers";

const apiOrigin = resolveApiOrigin(process.env);

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

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
