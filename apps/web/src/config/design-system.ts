/**
 * The /dev/design-system route shows every token so interface PRs can be reviewed and
 * screenshotted against it (docs/DESIGN.md, section 7). It exists in development; a
 * production build serves it only when VIRA_DESIGN_SYSTEM=true (the E2E suite and the
 * screenshot script), and never on Vercel.
 */
export function isDesignSystemEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env["VERCEL"]) return false;
  return env["NODE_ENV"] !== "production" || env["VIRA_DESIGN_SYSTEM"] === "true";
}
