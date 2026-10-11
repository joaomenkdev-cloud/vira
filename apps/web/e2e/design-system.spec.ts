import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("design system page", () => {
  test("shows the tokens and stays out of search engines", async ({ page }) => {
    await page.goto("/dev/design-system");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Design system");
    for (const section of ["Cores", "Tipografia", "Espaçamento", "Raios e sombra", "Movimento"]) {
      await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
    }
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("resolves every swatch to a real colour", async ({ page }) => {
    await page.goto("/dev/design-system");

    const backgrounds = await page
      .locator("#cores ~ ul > li > div")
      .evaluateAll((swatches) => swatches.map((el) => getComputedStyle(el).backgroundColor));
    expect(backgrounds.length).toBeGreaterThan(10);
    // A class that no token backs leaves the swatch transparent.
    expect(backgrounds.filter((colour) => colour === "rgba(0, 0, 0, 0)")).toEqual([]);
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/dev/design-system");
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  });
});
