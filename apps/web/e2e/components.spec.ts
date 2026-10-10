import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** WCAG violations inside one part of the page, as readable rows. */
async function violationsIn(page: Page, selector: string) {
  const results = await new AxeBuilder({ page }).include(selector).withTags(WCAG_TAGS).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target),
  }));
}

/** Records every console error, page error and CSP violation until the test ends. */
function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

const sections = [
  ["buttons", "#botoes"],
  ["form fields", "#campos"],
  ["badges", "#badges"],
  ["alerts", "#alertas"],
  ["toast triggers", "#toasts"],
  ["skeleton", "#carregamento"],
  ["empty states", "#estados-vazios"],
  ["modal and menu triggers", "#sobreposicoes"],
  ["header and footer", "#cabecalho-rodape"],
] as const;

test.describe("components: accessibility, one block at a time", () => {
  for (const [name, selector] of sections) {
    test(`${name} have no WCAG A/AA violations`, async ({ page }) => {
      await page.goto("/dev/design-system");
      expect(await violationsIn(page, selector)).toEqual([]);
    });
  }

  test("an open modal has no violations", async ({ page }) => {
    await page.goto("/dev/design-system");
    await page.getByRole("button", { name: "Confirmação (480 px)" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await violationsIn(page, '[role="dialog"]')).toEqual([]);
  });

  test("an open modal with a form has no violations", async ({ page }) => {
    await page.goto("/dev/design-system");
    await page.getByRole("button", { name: "Conteúdo (640 px)" }).click();
    expect(await violationsIn(page, '[role="dialog"]')).toEqual([]);
  });

  test("an open menu has no violations", async ({ page }) => {
    await page.goto("/dev/design-system");
    await page.getByRole("button", { name: "Ações" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect(await violationsIn(page, '[role="menu"]')).toEqual([]);
  });

  test("an open select has no violations", async ({ page }) => {
    await page.goto("/dev/design-system");
    await page.getByRole("combobox", { name: "Tipo de ingresso" }).first().click();
    await expect(page.getByRole("listbox")).toBeVisible();
    expect(await violationsIn(page, '[role="listbox"]')).toEqual([]);
  });

  test("a tooltip has no violations", async ({ page }) => {
    await page.goto("/dev/design-system");
    const trigger = page.getByRole("button", { name: "Adicionar" });
    // Scrolling closes a tooltip, so settle the scroll position before focusing.
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await trigger.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    // Radix renders the tooltip twice (visible, and a hidden copy for screen readers).
    expect(await violationsIn(page, "[data-radix-popper-content-wrapper]")).toEqual([]);
  });

  test("toasts have no violations", async ({ page }) => {
    await page.goto("/dev/design-system");
    await page.getByRole("button", { name: "Toast neutro" }).click();
    await page.getByRole("button", { name: "Toast de erro" }).click();
    await expect(page.getByRole("button", { name: "Fechar notificação" })).toHaveCount(2);
    expect(await violationsIn(page, 'ol[tabindex="-1"]')).toEqual([]);
  });
});

test.describe("components: behaviour in the browser", () => {
  test("no CSP violation or console error, through every overlay", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        // eslint-disable-next-line no-console -- reported back through the page console listener
        console.error(`CSP ${event.violatedDirective} blocked ${event.blockedURI || "inline"}`);
      });
    });
    await page.goto("/dev/design-system");

    await page.getByRole("button", { name: "Conteúdo (640 px)" }).click();
    await page.getByRole("dialog").getByRole("combobox").click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Ações" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("combobox", { name: "Tipo de ingresso" }).first().click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Toast de sucesso" }).click();
    await page.getByRole("button", { name: "Adicionar" }).focus();
    await expect(page.getByRole("tooltip")).toBeVisible();

    expect(problems).toEqual([]);
  });

  test("the server HTML carries no inline style, which the CSP would block", async ({
    request,
  }) => {
    const html = await (await request.get("/dev/design-system")).text();
    expect(html).not.toMatch(/<[a-z0-9]+[^>]*\sstyle="/i);
    expect(html).not.toContain("<style");
  });

  test("a modal locks the page scroll, traps focus and gives it back on Esc", async ({ page }) => {
    await page.goto("/dev/design-system");
    const opener = page.getByRole("button", { name: "Confirmação (480 px)" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Excluir este evento?" });
    await expect(dialog).toBeVisible();

    // The inline <style> of the scroll lock needs the CSP nonce; without it this stays "visible".
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }

    // With the focus on the × button its tooltip is open, and Esc closes that first
    // (WCAG 1.4.13); from any other control Esc closes the dialog.
    await dialog.getByRole("button", { name: "Cancelar" }).focus();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });

  test("the modal is a card on a desktop and a bottom sheet on a phone", async ({
    page,
  }, testInfo) => {
    await page.goto("/dev/design-system");
    await page.getByRole("button", { name: "Confirmação (480 px)" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Let the enter animation settle before measuring.
    await page.waitForTimeout(500);

    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("The dialog has no box.");

    if (testInfo.project.name === "mobile") {
      expect(box.width).toBeCloseTo(viewport.width, 0);
      expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
    } else {
      expect(box.width).toBeLessThanOrEqual(480);
      expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
      expect(box.y + box.height).toBeLessThan(viewport.height);
    }
  });

  test("the select inside a modal opens above it", async ({ page }) => {
    await page.goto("/dev/design-system");
    await page.getByRole("button", { name: "Conteúdo (640 px)" }).click();
    await page.getByRole("dialog").getByRole("combobox").click();
    const option = page.getByRole("option", { name: "Camarote" });
    await expect(option).toBeVisible();
    // If the list were under the modal, the click would land on the modal instead.
    await option.click();
    await expect(page.getByRole("dialog").getByRole("combobox")).toHaveText(/Camarote/);
  });

  test("the menu works with the keyboard and returns the focus", async ({ page }) => {
    await page.goto("/dev/design-system");
    const trigger = page.getByRole("button", { name: "Ações" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Editar" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Excluir" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("the quantity stepper announces its value in a live region", async ({ page }) => {
    await page.goto("/dev/design-system");
    const group = page.getByRole("group", { name: "Pista", exact: true });
    const value = group.getByRole("status");
    await expect(value).toHaveAttribute("aria-live", "polite");
    await expect(value).toHaveText("2");
    await group.getByRole("button", { name: "Aumentar quantidade" }).click();
    await expect(value).toHaveText("3");
  });

  test("a toast appears, can be closed and stays out of the way", async ({ page }) => {
    await page.goto("/dev/design-system");
    await page.getByRole("button", { name: "Toast neutro" }).click();
    const close = page.getByRole("button", { name: "Fechar notificação" });
    await expect(close).toBeVisible();
    await close.click();
    await expect(close).toHaveCount(0);
  });

  test("reduced motion stops the skeleton and the spinner", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dev/design-system");
    const durations = await page.evaluate(() => {
      const skeleton = document.querySelector(
        "#carregamento [aria-hidden='true'].animate-skeleton",
      );
      const spinner = document.querySelector("svg.animate-spin");
      return [skeleton, spinner].map((node) =>
        node ? getComputedStyle(node).animationDuration : "missing",
      );
    });
    for (const duration of durations) {
      // 0.01 ms is the global reduced-motion override.
      expect(duration).toMatch(/^(0\.01ms|1e-05s)(, (0\.01ms|1e-05s|0s))*$/);
    }
  });
});
