import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations, FAKE_API, signUp, uniqueEmail } from "./support/helpers";

interface Issued {
  orderId: string;
  tickets: string[];
}

/** A paid order with its tickets, straight from the stand-in API. */
async function issue(
  page: Page,
  email: string,
  { slug = "forro-na-praca", holders = "Ana Souza", status = "VALID" } = {},
): Promise<Issued> {
  const query = new URLSearchParams({ email, slug, holders, status });
  const response = await page.request.post(`${FAKE_API}/__test/tickets/issue?${query.toString()}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Issued;
}

test.describe("my tickets", () => {
  test("starts empty, with the way to the events", async ({ page, isMobile }, testInfo) => {
    await signUp(page, uniqueEmail(testInfo));
    await page.goto("/");
    if (isMobile) {
      await page.getByRole("button", { name: "Conta de Ana Souza" }).click();
      await page.getByRole("menuitem", { name: "Meus ingressos" }).click();
    } else {
      await page.getByRole("banner").getByRole("link", { name: "Meus ingressos" }).click();
    }

    await expect(page).toHaveURL(/\/ingressos$/);
    await expect(page.getByRole("heading", { name: "Você ainda não tem ingressos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explorar eventos" })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole("link", { name: "Passados" }).click();
    await expect(
      page.getByRole("heading", { name: "Nenhum ingresso de eventos passados" }),
    ).toBeVisible();
  });

  test("lists the tickets and opens one with its QR, the order and the others", async ({
    page,
    isMobile,
  }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await issue(page, email, { holders: "Ana Souza,Caio Lima" });

    await page.goto("/ingressos");
    const rows = page.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Forró na Praça");
    await expectNoA11yViolations(page);

    await rows.filter({ hasText: "Ana Souza" }).getByRole("link").click();
    await expect(page).toHaveURL(/\/ingressos\/[0-9a-f-]{36}$/);
    const ticket = page.getByRole("article", { name: /Ingresso VIRA-/ });
    await expect(ticket).toContainText("Ana Souza");
    await expect(ticket).toContainText("Forró na Praça");
    await expect(
      ticket.getByRole("img", { name: /QR Code do ingresso VIRA-\w{4}-\w{4}/ }),
    ).toBeVisible();
    await expect(ticket).toContainText("Apresente este QR na entrada");
    await expect(page.getByText(/Pedido VIRA-ORD-/)).toBeVisible();
    await expectNoA11yViolations(page);

    // The other ticket of the order is a button away, not only a swipe.
    if (isMobile) {
      await expect(page.getByText("1 de 2")).toBeVisible();
      await page.getByRole("link", { name: "Próximo ingresso" }).click();
    } else {
      await page
        .getByRole("region", { name: "Ingressos deste pedido" })
        .getByRole("link", { name: /Caio Lima/ })
        .click();
    }
    await expect(page.getByRole("article", { name: /Ingresso VIRA-/ })).toContainText("Caio Lima");

    // At the door: the QR alone on white, closed with Esc.
    await page.getByRole("button", { name: "Tela cheia" }).click();
    const fullscreen = page.getByRole("dialog", { name: /QR Code em tela cheia/ });
    await expect(fullscreen).toBeVisible();
    await expect(fullscreen).toContainText("Caio Lima");
    await page.keyboard.press("Escape");
    await expect(fullscreen).toBeHidden();
    await expect(page.getByRole("button", { name: "Tela cheia" })).toBeFocused();

    // Printed, the ticket goes without the header, the footer or the buttons.
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByRole("button", { name: "Imprimir" })).toBeHidden();
    await expect(page.getByRole("article", { name: /Ingresso VIRA-/ })).toBeVisible();
  });

  test("shows a used ticket faded with its time, and a canceled one without a QR", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    const used = await issue(page, email, { slug: "jazz-no-teatro", status: "USED" });
    const canceled = await issue(page, email, { slug: "festival-de-cinema", status: "CANCELED" });

    await page.goto(`/ingressos/${used.tickets[0] ?? ""}`);
    await expect(page.getByText(/Utilizado em \d\d\/\d\d às \d\d:\d\d/)).toBeVisible();
    await expect(page.getByRole("img", { name: /QR Code do ingresso/ })).toBeVisible();

    await page.goto(`/ingressos/${canceled.tickets[0] ?? ""}`);
    await expect(page.getByText("Ingresso cancelado")).toBeVisible();
    await expect(page.getByRole("img", { name: /QR Code do ingresso/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tela cheia" })).toBeDisabled();
    await expectNoA11yViolations(page);

    await page.goto("/ingressos");
    await expect(page.getByRole("listitem").filter({ hasText: "Utilizado" })).toHaveCount(1);
    await expect(page.getByRole("listitem").filter({ hasText: "Cancelado" })).toHaveCount(1);
  });

  test("keeps the tickets of past events apart", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await issue(page, email, { slug: "evento-encerrado" });

    await page.goto("/ingressos");
    await expect(page.getByRole("heading", { name: "Você ainda não tem ingressos" })).toBeVisible();
    await page.getByRole("link", { name: "Passados" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
  });

  test("says when a ticket does not exist, and needs a session", async ({ page }, testInfo) => {
    await page.goto("/ingressos");
    await expect(page).toHaveURL(/\/entrar\?next=(%2F|\/)ingressos/);

    await signUp(page, uniqueEmail(testInfo));
    await page.goto("/ingressos/0192a0e4-1111-7000-8000-000000000001");
    await expect(page.getByRole("heading", { name: "Ingresso não encontrado" })).toBeVisible();
  });
});
