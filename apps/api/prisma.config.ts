import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// The Prisma CLI does not read .env files; load the local one when present.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Only migrate/introspect commands need a database; `prisma generate` does not.
  ...(process.env["DATABASE_URL"] ? { datasource: { url: process.env["DATABASE_URL"] } } : {}),
});
