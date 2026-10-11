// Captures the screenshots that interface pull requests must include (desktop and mobile).
// Needs the production server running:
// `pnpm --filter @vira/web build && VIRA_DESIGN_SYSTEM=true pnpm --filter @vira/web start`.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium, devices } from "@playwright/test";

const baseUrl = process.env["WEB_URL"] ?? "http://127.0.0.1:3001";
const outDir =
  process.env["SCREENSHOT_DIR"] ??
  join(import.meta.dirname, "..", "..", "..", "docs", "assets", "screenshots");
const pages = [
  { name: "home", path: "/" },
  { name: "not-found", path: "/esta-pagina-nao-existe" },
  // Served by a production build only with VIRA_DESIGN_SYSTEM=true.
  { name: "design-system", path: "/dev/design-system" },
];
const viewports = [
  { name: "desktop", options: { viewport: { width: 1280, height: 800 } } },
  { name: "mobile", options: { ...devices["Pixel 7"] } },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const viewport of viewports) {
    const context = await browser.newContext(viewport.options);
    const page = await context.newPage();
    for (const { name, path } of pages) {
      await page.goto(`${baseUrl}${path}`);
      await page.waitForLoadState("networkidle");
      const file = join(outDir, `web-${name}-${viewport.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      process.stdout.write(`${file}\n`);
    }

    // Open layers cannot show in a full-page capture of the closed page: photograph them
    // on their own (the modal is a card on a desktop and a bottom sheet on a phone).
    await page.goto(`${baseUrl}/dev/design-system`);
    await page.waitForLoadState("networkidle");
    const overlays = [
      { name: "modal", open: "Confirmação (480 px)", ready: () => page.getByRole("dialog") },
      { name: "menu", open: "Ações", ready: () => page.getByRole("menu") },
    ];
    for (const { name, open, ready } of overlays) {
      await page.getByRole("button", { name: open }).scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: open }).click();
      await ready().waitFor();
      // Wait for the enter animation (320 ms at most) before the shot.
      await page.waitForTimeout(500);
      const file = join(outDir, `web-${name}-${viewport.name}.png`);
      await page.screenshot({ path: file });
      process.stdout.write(`${file}
`);
      await page.keyboard.press("Escape");
      await ready().waitFor({ state: "hidden" });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
