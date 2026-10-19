import type { MetadataRoute } from "next";

/** Everything public may be indexed; the API proxy and the design-system page may not. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dev/"] } };
}
