import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  expectNoA11yViolations,
  FAKE_API,
  PASSWORD,
  signIn,
  signUp,
  uniqueEmail,
} from "./support/helpers";

async function testRoute(page: Page, route: string, email: string): Promise<void> {
  const response = await page.request.post(
    `${FAKE_API}/__test/${route}?email=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
}

async function openDeletion(page: Page) {
  await page.goto("/conta#privacidade");
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir sua conta?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("privacy", () => {
  test("publishes the policy and links it from the footer and the sign-up", async ({ page }) => {
    await page.goto("/eventos");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Política de privacidade" })
      .click();
    await expect(page).toHaveURL(/\/privacidade$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Política de privacidade" }),
    ).toBeVisible();
    await expect(page.getByText("Nome do titular de cada ingresso")).toBeVisible();
    await expect(page.getByText("Até 90 dias depois do evento.").first()).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto("/cadastro");
    await expect(
      page.getByRole("main").getByRole("link", { name: "política de privacidade" }),
    ).toHaveAttribute("href", "/privacidade");
  });

  test("downloads everything the account holds", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await page.goto("/conta#privacidade");
    await expect(page.getByRole("heading", { level: 2, name: "Privacidade" })).toBeVisible();
    await expectNoA11yViolations(page);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar meus dados" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^vira-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile(await file.path(), "utf8")) as {
      format: string;
      account: { email: string; name: string };
    };
    expect(data.format).toBe("vira.data-export.v1");
    expect(data.account).toMatchObject({ email, name: "Ana Souza" });
    await expect(page.getByText("Pronto: o arquivo foi baixado.")).toBeVisible();
  });

  test("deletes the account once the password and the word are typed", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    const dialog = await openDeletion(page);
    await expect(dialog).toContainText("O valor pago não é devolvido.");
    await expectNoA11yViolations(page);

    const remove = dialog.getByRole("button", { name: "Excluir conta" });
    await remove.click();
    await expect(dialog.getByText("Informe sua senha.").first()).toBeVisible();
    await expect(
      dialog.getByText("Digite EXCLUIR, em letras maiúsculas, para confirmar.").first(),
    ).toBeVisible();

    await dialog.getByLabel("Sua senha").fill("não é esta");
    await dialog.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
    await remove.click();
    await expect(dialog.getByText("Senha incorreta.").first()).toBeVisible();
    await expectNoA11yViolations(page);

    await dialog.getByLabel("Sua senha").fill(PASSWORD);
    await remove.click();
    await expect(page).toHaveURL(/\/conta-excluida$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sua conta foi excluída" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
    await expectNoA11yViolations(page);

    // The account is gone: the old password opens nothing.
    await page.goto("/conta");
    await expect(page).toHaveURL(/\/entrar\?next=/);
    await signIn(page, email);
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("keeps an organizer with events to come", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await testRoute(page, "make-organizer", email);
    await testRoute(page, "checkin/event", email);

    const dialog = await openDeletion(page);
    await dialog.getByLabel("Sua senha").fill(PASSWORD);
    await dialog.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
    await dialog.getByRole("button", { name: "Excluir conta" }).click();
    await expect(
      dialog.getByText("Você tem eventos publicados que ainda vão acontecer."),
    ).toBeVisible();
    await expect(dialog.getByRole("link", { name: "painel" })).toHaveAttribute("href", "/painel");

    await dialog.getByRole("button", { name: "Manter minha conta" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Minha conta" })).toBeVisible();
  });

  test("asks an account without a password to sign in again", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await testRoute(page, "social-only", email);
    await testRoute(page, "age-sessions", email);

    const dialog = await openDeletion(page);
    await expect(dialog.getByLabel("Sua senha")).toHaveCount(0);
    await expect(dialog.getByText("Por segurança, confirme que é você.")).toBeVisible();
    await dialog.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
    await dialog.getByRole("button", { name: "Excluir conta" }).click();
    await expect(dialog.getByText("Entre de novo para confirmar que é você.")).toBeVisible();
    await expectNoA11yViolations(page);

    await dialog.getByRole("button", { name: "Entrar de novo" }).click();
    await expect(page).toHaveURL(/\/entrar\?next=(%2F|\/)conta$/);
  });
});
