import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Served by the same build against a stand-in API with no published event (see
// playwright.config.ts), for the empty states.
const EMPTY_SITE = "http://127.0.0.1:3102";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target),
  }));
}

/** Console errors and page errors, CSP violations included. */
function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

const featured = (page: Page) => page.getByRole("region", { name: "Em destaque" });

test.describe("home", () => {
  test("shows the featured events as cards that lead to their pages", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Encontre seu próximo evento.",
    );
    const card = featured(page).getByRole("article").filter({ hasText: "Noite de Jazz" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Teatro Municipal · São Paulo");
    await expect(card).toContainText("A partir de R$ 60,00");
    await expect(card).toContainText("Demonstração");
    await expect(card.locator("time")).toHaveText(/^[A-ZÁÉÍÓÚÇ]{3}, \d{1,2} [A-Z]{3} · 21:00$/);

    await card.getByRole("link", { name: "Noite de Jazz no Teatro Municipal" }).click();
    await expect(page).toHaveURL("/eventos/jazz-no-teatro");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Noite de Jazz no Teatro Municipal",
    );
  });

  test("never shows more than six featured events, and only those on sale", async ({ page }) => {
    await page.goto("/");
    const cards = featured(page).getByRole("article");
    expect(await cards.count()).toBeLessThanOrEqual(6);
    // The sold-out poetry evening is upcoming, but has nothing on sale.
    await expect(featured(page)).not.toContainText("Sarau de Poesia");
  });

  test("shows the soonest event beside the title on a desktop, as the first card on a phone", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    const spotlight = page.getByRole("link", { name: /Forró na Praça/ }).first();
    const firstCard = featured(page).getByRole("article").filter({ hasText: "Forró na Praça" });
    if (isMobile) {
      await expect(firstCard).toBeVisible();
      // The search stays above the fold.
      await expect(page.getByRole("searchbox", { name: "Buscar evento" })).toBeInViewport();
    } else {
      await expect(spotlight).toBeVisible();
      await expect(firstCard).toBeHidden();
    }
  });

  test("loads the photos through this origin's optimizer, with no CSP violation", async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const photo = featured(page).getByRole("img", { name: "Foto do evento Feira de Livros 1" });
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toHaveJSProperty("complete", true);
    expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect(await photo.getAttribute("src")).toMatch(/^\/_next\/image\?url=/);
    expect(await photo.getAttribute("srcset")).toContain("w=");
    expect(await photo.getAttribute("style")).toBeNull();
    expect(problems).toEqual([]);
  });

  test("searches from the home page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Buscar evento" }).fill("jazz");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();

    await expect(page).toHaveURL("/eventos?q=jazz");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Noite de Jazz no Teatro Municipal");
  });

  test("has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/");
    expect(await violations(page)).toEqual([]);
  });

  test("does not scroll sideways at 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("says plainly that there are no events yet, inventing nothing", async ({ page }) => {
    await page.goto(`${EMPTY_SITE}/`);

    await expect(page.getByRole("heading", { name: "Nenhum evento por aqui ainda" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByText(/R\$/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ver todos" })).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("explore", () => {
  test("lists the upcoming events soonest first, a page at a time", async ({ page }) => {
    await page.goto("/eventos");

    await expect(page).toHaveTitle("Explorar eventos · Vira");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Próximos eventos");
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(12);
    // Which fixture comes first depends on the weekday the suite runs: check the order.
    const starts = await cards
      .locator("time")
      .evaluateAll((times) => times.map((time) => time.getAttribute("datetime") ?? ""));
    expect(starts).toEqual([...starts].sort((a, b) => Date.parse(a) - Date.parse(b)));
    // Sold out still shows, with the badge and without a price line.
    const soldOut = cards.filter({ hasText: "Sarau de Poesia" });
    await expect(soldOut).toContainText("Esgotado");
    await expect(soldOut).not.toContainText("R$");

    await page.getByRole("link", { name: "Mais eventos" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(cards).toHaveCount(3);
    await expect(cards.last()).toContainText("Feira de Livros 11");
    await expect(page.getByRole("link", { name: "Mais eventos" })).toHaveCount(0);
  });

  test("filters by text and city, and offers to clear a search with no result", async ({
    page,
  }) => {
    await page.goto("/eventos?q=feira&cidade=curitiba");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Buscar eventos");
    await expect(page.getByLabel("Evento (opcional)")).toHaveValue("feira");
    await expect(page.getByLabel("Cidade (opcional)")).toHaveValue("curitiba");
    await expect(page.getByRole("article").first()).toContainText("Feira de Livros 1");

    await page.goto("/eventos?q=maracatu");
    await expect(
      page.getByRole("heading", { name: 'Nada encontrado para "maracatu"' }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL("/eventos");
    await expect(page.getByRole("article")).toHaveCount(12);
  });

  test("explains a search too short next to the field", async ({ page }) => {
    await page.goto("/eventos?q=a");
    const field = page.getByLabel("Evento (opcional)");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Digite pelo menos 2 letras para buscar.")).toBeVisible();
    // Nothing was searched: every upcoming event is still listed.
    await expect(page.getByRole("article")).toHaveCount(12);
  });

  test("turns the weekend filter on and off", async ({ page }) => {
    await page.goto("/eventos");
    await page.getByRole("link", { name: "Este fim de semana" }).click();

    await expect(page).toHaveURL("/eventos?periodo=fim-de-semana");
    await expect(page.getByRole("link", { name: "Este fim de semana" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    const cards = page.getByRole("article");
    await expect(cards.filter({ hasText: "Noite de Jazz" })).toHaveCount(1);
    // Only Saturday and Sunday events; the next pages of fairs are weeks away.
    for (const date of await cards.locator("time").allTextContents()) {
      expect(date).toMatch(/^(SÁB|DOM),/);
    }
    await expect(cards.filter({ hasText: "Feira de Livros" })).toHaveCount(0);

    await page.getByRole("link", { name: "Este fim de semana" }).click();
    await expect(page).toHaveURL("/eventos");
    await expect(page.getByRole("article")).toHaveCount(12);
  });

  test("recovers from an edited page link", async ({ page }) => {
    await page.goto("/eventos?q=feira&cursor=inventado");
    await expect(page.getByRole("heading", { name: "Esta página da lista expirou" })).toBeVisible();
    await page.getByRole("link", { name: "Voltar ao início da lista" }).click();
    await expect(page).toHaveURL("/eventos?q=feira");
  });

  test("marks Explorar as the current page in the header, on a desktop", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/eventos");
    if (isMobile) {
      await expect(page.getByRole("link", { name: "Buscar" })).toBeVisible();
    } else {
      await expect(
        page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Explorar" }),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  test("has no WCAG A/AA violations, filled, with an error or empty", async ({ page }) => {
    for (const url of [
      "/eventos",
      "/eventos?q=a",
      "/eventos?q=maracatu",
      `${EMPTY_SITE}/eventos`,
    ]) {
      await page.goto(url);
      expect(await violations(page), url).toEqual([]);
    }
  });

  test("does not scroll sideways at 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/eventos");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("event page", () => {
  test("reads photo, name, date and place, description, then tickets", async ({ page }) => {
    await page.goto("/eventos/forro-na-praca");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Ingressos" })).toBeVisible();
    // innerText: what is rendered, without the JSON-LD script.
    const text = await main.innerText();
    const order = ["Foto:", "Forró na Praça", "Rua da Aurora", "Sobre o evento", "Ingressos"];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    await expect(main.getByRole("img", { name: "Foto do evento Forró na Praça" })).toBeVisible();
  });

  test("tells when, where and who, in the event's time zone", async ({ page }) => {
    await page.goto("/eventos/forro-na-praca");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Forró na Praça");
    await expect(page.getByText(/^[A-ZÁÉÍÓÚÇ]{3}, \d{1,2} [A-Z]{3} \d{4} · 21:00$/)).toBeVisible();
    await expect(page.getByText(/ · 21:00 – 02:00$/)).toBeVisible();
    await expect(page.getByText("Horário Padrão de Brasília (GMT−3)")).toBeVisible();
    await expect(page.getByText("Rua da Aurora, 100 · Recife - PE")).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver no mapa/ })).toHaveAttribute(
      "href",
      /^https:\/\/www\.openstreetmap\.org\/search\?query=Casa%20de%20Shows/,
    );
    await expect(page.getByText("Organizado por Organização de Teste")).toBeVisible();
  });

  test("credits the photo and flags the demonstration event", async ({ page }) => {
    await page.goto("/eventos/forro-na-praca");
    await expect(page.getByRole("link", { name: "Autora da Foto" })).toHaveAttribute(
      "href",
      "https://unsplash.com/",
    );
    await expect(page.getByText("Demonstração", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Evento de demonstração" }),
    ).toContainText("nenhuma cobrança é feita");
  });

  test("lists the ticket types with their price and state, to choose one", async ({ page }) => {
    await page.goto("/eventos/forro-na-praca");
    const tickets = page.getByRole("complementary", { name: "Ingressos" }).getByRole("listitem");

    await expect(tickets).toHaveCount(3);
    await expect(tickets.nth(0)).toContainText("Pista");
    await expect(tickets.nth(0)).toContainText("R$ 80,00");
    await expect(tickets.nth(1)).toContainText("Últimos ingressos");
    await expect(tickets.nth(2)).toContainText("Esgotado");
    await expect(page.getByRole("radio", { name: /Meia-entrada/ })).toBeDisabled();
    // Nothing is chosen yet: the button leads to the choice (the checkout has its own spec).
    await expect(page.getByRole("button", { name: "Ver ingressos" })).toBeVisible();
  });

  test("says when the sales of a ticket type open", async ({ page }) => {
    await page.goto("/eventos/festival-de-cinema");
    await expect(page.getByText(/^Vendas a partir de \d{2}\/\d{2} às 12:00$/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ingressos indisponíveis" })).toBeVisible();
    // Not a demonstration event: no badge, no notice.
    await expect(page.getByText("Demonstração", { exact: true })).toHaveCount(0);
  });

  test("folds a long description on a phone behind “Ler mais”", async ({ page, isMobile }) => {
    await page.goto("/eventos/forro-na-praca");
    const more = page.getByRole("button", { name: "Ler mais" });
    const lastParagraph = page.getByText("Classificação: 16 anos.", { exact: false });

    if (!isMobile) {
      await expect(more).toBeHidden();
      await expect(lastParagraph).toBeVisible();
      return;
    }
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(lastParagraph).not.toBeInViewport();
    await more.click();
    await expect(more).toHaveCount(0);
    await lastParagraph.scrollIntoViewIfNeeded();
    await expect(lastParagraph).toBeInViewport();
  });

  test("keeps a canceled event's page, saying so first", async ({ page }) => {
    await page.goto("/eventos/show-cancelado");
    await expect(page.getByRole("alert").filter({ hasText: "Evento cancelado" })).toContainText(
      "O organizador cancelou este evento.",
    );
    await expect(page.getByText("As vendas foram encerradas com o cancelamento.")).toBeVisible();
    await expect(page.getByText("R$ 90,00")).toHaveCount(0);
  });

  test("keeps a past event's page, closed", async ({ page }) => {
    await page.goto("/eventos/evento-encerrado");
    await expect(page.getByText("Este evento já aconteceu")).toBeVisible();
    await expect(page.getByText("As vendas deste evento foram encerradas.")).toBeVisible();
  });

  test("describes itself to search engines and link previews", async ({ page }) => {
    await page.goto("/eventos/forro-na-praca");

    await expect(page).toHaveTitle("Forró na Praça · Vira");
    const meta = (selector: string) => page.locator(selector).first().getAttribute("content");
    expect(await meta('meta[name="description"]')).toMatch(/^Uma noite inteira de forró/);
    expect(await meta('meta[property="og:title"]')).toBe("Forró na Praça");
    expect(await meta('meta[property="og:image"]')).toMatch(
      /^https?:\/\/[^/]+\/eventos\/forro-na-praca\/imagem$/,
    );
    expect(await meta('meta[property="og:image:alt"]')).toBe("Foto do evento Forró na Praça");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(
      /\/eventos\/forro-na-praca$/,
    );

    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    ) as Record<string, unknown>;
    expect(jsonLd).toMatchObject({
      "@type": "Event",
      name: "Forró na Praça",
      eventStatus: "https://schema.org/EventScheduled",
      location: { "@type": "Place", address: { addressLocality: "Recife", addressRegion: "PE" } },
      offers: { lowPrice: "40.00", highPrice: "200.00", priceCurrency: "BRL" },
    });
  });

  test("gives link previews a photo address that does not expire", async ({ request }) => {
    const redirect = await request.get("/eventos/forro-na-praca/imagem", { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["location"]).toMatch(/^\/_next\/image\?url=.+&w=1200&q=75$/);

    const image = await request.get("/eventos/forro-na-praca/imagem");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toMatch(/^image\//);
  });

  test("answers an unknown event with the not-found page, kept out of search engines", async ({
    page,
  }) => {
    await page.goto("/eventos/nao-existe");
    await expect(page.getByRole("heading", { name: "Não encontramos esta página" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  });

  test("has no WCAG A/AA violations, nor CSP violations", async ({ page }) => {
    for (const slug of ["forro-na-praca", "festival-de-cinema", "show-cancelado"]) {
      const problems = collectProblems(page);
      await page.goto(`/eventos/${slug}`);
      await page.waitForLoadState("networkidle");
      expect(await violations(page), slug).toEqual([]);
      expect(problems, slug).toEqual([]);
    }
  });

  test("does not scroll sideways at 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/eventos/forro-na-praca");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
