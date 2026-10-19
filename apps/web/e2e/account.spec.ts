import { expect, request, test } from "@playwright/test";

import {
  accountButton,
  BREACHED_PASSWORD,
  expectNoA11yViolations,
  FAKE_API,
  lastLink,
  PASSWORD,
  signUp,
  uniqueEmail,
} from "./support/helpers";

test.describe("account", () => {
  let email: string;

  test.beforeEach(async ({ page }, testInfo) => {
    email = uniqueEmail(testInfo);
    await signUp(page, email);
    await page.goto("/conta");
    await expect(page.getByRole("heading", { name: "Minha conta", level: 1 })).toBeVisible();
  });

  test("shows the account, with no accessibility violations", async ({ page }) => {
    await expect(page).toHaveTitle("Minha conta · Vira");
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Esta sessão")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("changes the name, and the header follows", async ({ page }) => {
    await page.getByLabel("Nome", { exact: true }).fill("Ana Lima");
    await page.getByRole("button", { name: "Salvar nome" }).click();
    await expect(page.getByText("Nome atualizado.")).toBeVisible();
    await expect(accountButton(page, "Ana Lima")).toBeVisible();
  });

  test("changes the password, refusing a wrong current one and a breached new one", async ({
    page,
  }) => {
    const current = page.getByLabel("Senha atual").last();
    const next = page.getByLabel("Senha nova");
    const submit = page.getByRole("button", { name: "Trocar senha" });

    await current.fill("errada");
    await next.fill("outra frase longa e segura");
    await submit.click();
    await expect(current).toHaveAccessibleDescription("Senha incorreta.");
    await expect(current).toBeFocused();

    await current.fill(PASSWORD);
    await next.fill(BREACHED_PASSWORD);
    await submit.click();
    await expect(next).toHaveAccessibleDescription(/vazamentos/);

    await next.fill("outra frase longa e segura");
    await submit.click();
    await expect(page.getByText("Senha alterada.")).toBeVisible();
  });

  test("changes the e-mail through the link sent to the new address", async ({
    page,
  }, testInfo) => {
    const newEmail = uniqueEmail(testInfo);
    await page.getByLabel("E-mail novo").fill(newEmail);
    await page.getByLabel("Senha atual").first().fill(PASSWORD);
    await page.getByRole("button", { name: "Trocar e-mail" }).click();
    await expect(page.getByText(`Enviamos um link para ${newEmail}`)).toBeVisible();

    const { token } = await lastLink(page.request, newEmail);
    await page.goto(`/confirmar-email#token=${token}`);
    await expect(page.getByText("E-mail alterado.")).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole("link", { name: "Minha conta" }).click();
    await expect(page.getByText(newEmail)).toBeVisible();
  });

  test("becomes an organizer", async ({ page }) => {
    await page.getByLabel("Nome de organizador").fill("Coletivo Vira");
    await page.getByRole("button", { name: "Quero organizar eventos" }).click();
    await expect(page.getByText("Você organiza eventos como Coletivo Vira.")).toBeVisible();
    await page.getByRole("link", { name: "Ir para meus eventos" }).click();
    await expect(page.getByRole("heading", { name: "Meus eventos", level: 1 })).toBeVisible();
  });

  test("ends another session, then every session", async ({ page }) => {
    // A second login of the same account, from "another device" (its own cookie jar).
    const device = await request.newContext();
    const login = await device.post(`${FAKE_API}/api/v1/auth/login`, {
      data: { email, password: PASSWORD },
    });
    expect(login.ok()).toBe(true);
    await device.dispose();
    await page.reload();

    const end = page.getByRole("button", { name: /^Encerrar a sessão de/ });
    await expect(end).toHaveCount(1);
    await end.click();
    await expect(end).toHaveCount(0);

    await page.getByRole("button", { name: "Sair de todos os dispositivos" }).click();
    const dialog = page.getByRole("dialog", { name: "Sair de todos os dispositivos?" });
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole("button", { name: "Sair de todos" }).click();
    // Back to the login, which returns to the account page.
    await expect(page).toHaveURL("/entrar?next=/conta");
  });
});
