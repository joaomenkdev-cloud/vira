import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations, FAKE_API, signIn, signUp, uniqueEmail } from "./support/helpers";
import { DECLINED_CARD, stubStripe } from "./support/stripe";

const EVENT = "/eventos/forro-na-praca";

/** The purchase button: inline on a desktop, in the fixed bar on a phone. */
const buyButton = (page: Page, name = "Comprar ingresso") =>
  page.getByRole("button", { name, exact: true });

async function chooseCamarote(page: Page, quantity: number) {
  await page.getByRole("radio", { name: /Camarote/ }).check();
  for (let count = 1; count < quantity; count += 1) {
    await page.getByRole("button", { name: "Aumentar quantidade" }).click();
  }
}

function orderIdOf(page: Page): string {
  const id = /\/checkout\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error(`Not on a checkout: ${page.url()}`);
  return id;
}

async function startCheckout(page: Page, quantity = 2): Promise<string> {
  await page.goto(EVENT);
  await chooseCamarote(page, quantity);
  await buyButton(page).click();
  await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Reservado por \d\d:\d\d/)).toBeVisible();
  return orderIdOf(page);
}

test.describe("checkout", () => {
  test.beforeEach(async ({ page }) => {
    await stubStripe(page);
  });

  test("a visitor signs in with the choice kept, names the holders, pays and gets the tickets", async ({
    page,
    context,
  }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await context.clearCookies();

    await page.goto(EVENT);
    await expect(buyButton(page, "Ver ingressos")).toBeVisible();
    await chooseCamarote(page, 2);
    await expect(page.getByText("R$ 400,00").filter({ visible: true }).first()).toBeVisible();
    await buyButton(page).click();

    await expect(page).toHaveURL(/\/entrar\?next=/);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/eventos\/forro-na-praca\?ingresso=.+&quantidade=2/);
    await expect(page.getByRole("radio", { name: /Camarote/ })).toBeChecked();
    await expect(page.getByRole("group", { name: /Quantidade de Camarote/ })).toContainText("2");

    await buyButton(page).click();
    await expect(page).toHaveURL(/\/checkout\//);
    const orderId = orderIdOf(page);
    await expect(page.getByRole("navigation", { name: "Etapas" })).toContainText("Seus dados");
    await expect(page.getByRole("banner")).toContainText("Pagamento seguro");
    await expect(page.getByRole("banner").getByRole("link", { name: "Explorar" })).toHaveCount(0);
    await expectNoA11yViolations(page);

    // The first ticket is the buyer's by default; the second needs a name.
    const first = page.getByLabel("Titular do ingresso 1 (Camarote)");
    const second = page.getByLabel("Titular do ingresso 2 (Camarote)");
    await expect(first).toHaveValue("Ana Souza");
    await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
    await expect(page.getByText("informe o nome do titular")).toBeVisible();
    await expect(second).toBeFocused();
    await second.fill("Caio Lima");
    await page.getByRole("button", { name: "Continuar para o pagamento" }).click();

    await expect(page.getByRole("heading", { name: "Pagamento" })).toBeVisible();
    await expect(page.getByText("Modo de teste", { exact: true })).toBeVisible();
    await page.getByLabel("Número do cartão").fill("4242 4242 4242 4242");
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: "Pagar R$ 400,00" }).click();

    await expect(page).toHaveURL(new RegExp(`/checkout/${orderId}/confirmacao$`));
    await expect(page.getByRole("heading", { name: "Confirmando pagamento…" })).toBeVisible();
    // Only the webhook marks the order as paid.
    expect((await page.request.post(`${FAKE_API}/__test/orders/pay?id=${orderId}`)).status()).toBe(
      204,
    );

    await expect(page.getByRole("heading", { name: "Pagamento confirmado" })).toBeVisible();
    const tickets = page.getByRole("region", { name: "Ingressos" }).getByRole("listitem");
    await expect(tickets).toHaveCount(2);
    await expect(tickets.filter({ hasText: "Ana Souza" })).toContainText(/VIRA-\w{4}-\w{4}/);
    await expect(tickets.filter({ hasText: "Caio Lima" })).toContainText("Camarote");
    await expectNoA11yViolations(page);

    // The paid order's checkout leads to its confirmation.
    await page.goto(`/checkout/${orderId}`);
    await expect(page.getByRole("heading", { name: "Pagamento confirmado" })).toBeVisible();
  });

  test("a declined card says so and keeps the reservation", async ({ page }, testInfo) => {
    await signUp(page, uniqueEmail(testInfo));
    await startCheckout(page, 1);

    await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
    await page.getByLabel("Número do cartão").fill(DECLINED_CARD);
    await page.getByRole("button", { name: "Pagar R$ 200,00" }).click();

    await expect(page.getByRole("region", { name: "Pagamento" }).getByRole("alert")).toContainText(
      "Seu cartão foi recusado.",
    );
    await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("button", { name: "Pagar R$ 200,00" })).toBeEnabled();
  });

  test("buying again for the same event resumes the reservation in progress", async ({
    page,
  }, testInfo) => {
    await signUp(page, uniqueEmail(testInfo));
    const orderId = await startCheckout(page, 1);

    await page.goto(EVENT);
    await page.getByRole("radio", { name: /Pista/ }).check();
    await buyButton(page).click();

    await expect(page).toHaveURL(new RegExp(`/checkout/${orderId}\\?retomada=1$`));
    await expect(page.getByText("Você já tinha uma reserva para este evento")).toBeVisible();
  });

  test("the last two minutes warn and offer to keep the reservation, once", async ({
    page,
  }, testInfo) => {
    await signUp(page, uniqueEmail(testInfo));
    const orderId = await startCheckout(page, 1);
    await expect(page.getByRole("button", { name: "Manter reserva" })).toHaveCount(0);

    await page.request.post(`${FAKE_API}/__test/orders/expire-in?id=${orderId}&seconds=90`);
    await page.reload();
    await expect(page.getByText(/Reservado por 01:\d\d/)).toBeVisible();
    await page.getByRole("button", { name: "Manter reserva" }).click();

    await expect(page.getByText(/Reservado por 1[01]:\d\d/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Manter reserva" })).toHaveCount(0);
  });

  test("an expired reservation says so and goes back to the same choice", async ({
    page,
  }, testInfo) => {
    await signUp(page, uniqueEmail(testInfo));
    const orderId = await startCheckout(page, 2);

    await page.request.post(`${FAKE_API}/__test/orders/expire-in?id=${orderId}&seconds=2`);
    await page.reload();
    const dialog = page.getByRole("dialog", { name: "Sua reserva expirou" });
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole("button", { name: "Tentar de novo" }).click();

    await expect(page).toHaveURL(/\/eventos\/forro-na-praca\?ingresso=.+&quantidade=2#ingressos/);
    await expect(page.getByRole("radio", { name: /Camarote/ })).toBeChecked();
  });

  test("a checkout needs a session", async ({ page }) => {
    await page.goto("/checkout/0192a0e4-1111-7000-8000-000000000001");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fcheckout%2F0192a0e4/);
  });
});
