import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target),
  }));
}

test.describe("home", () => {
  test("presents the product and an honest empty state", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Vira — Encontre seu próximo evento");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Encontre seu próximo evento.",
    );
    await expect(page.getByRole("heading", { name: "Nenhum evento por aqui ainda" })).toBeVisible();

    // Nothing invented: no event cards, prices, links to pages that do not exist yet.
    await expect(page.getByText(/R\$/)).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("has the page landmarks and a single level-1 heading", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText("modo de teste");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/");
    expect(await violations(page)).toEqual([]);
  });

  test("does not scroll sideways, even at 320 px (reflow)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("keeps touch targets at least 44 px", async ({ page }) => {
    await page.goto("/");
    for (const target of [
      page.getByRole("link", { name: "Vira, página inicial" }),
      page.getByRole("link", { name: "Ver no GitHub" }),
    ]) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("keyboard", () => {
  test("the first Tab stop is a skip link that moves focus to the content", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("focus is always visible, drawn in the accent colour", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab"); // logo
    const logo = page.getByRole("link", { name: "Vira, página inicial" });
    await expect(logo).toBeFocused();

    const outline = await logo.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(outline).toEqual({ style: "solid", width: "2px", color: "rgb(217, 45, 58)" });
  });
});

test.describe("security", () => {
  test("every page carries a nonce-based CSP and the hardening headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the nonce changes on every request and stamps every script", async ({ request }) => {
    const nonceOf = (csp: string | undefined) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];

    const first = await request.get("/");
    const second = await request.get("/");
    expect(nonceOf(first.headers()["content-security-policy"])).not.toBe(
      nonceOf(second.headers()["content-security-policy"]),
    );

    const nonce = nonceOf(first.headers()["content-security-policy"]);
    const scripts = (await first.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);
  });

  test("the browser reports no CSP violation or script error", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("/api/v1 is proxied to the API on the same origin", async ({ request }) => {
    const response = await request.get("/api/v1/health/live");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

test.describe("not found", () => {
  test("answers 404 with a way back, and no accessibility violations", async ({ page }) => {
    const response = await page.goto("/esta-pagina-nao-existe");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Página não encontrada");
    await expect(page.getByRole("link", { name: "Voltar para o início" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
