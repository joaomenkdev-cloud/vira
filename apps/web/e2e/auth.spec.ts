import { expect, test } from "@playwright/test";

import {
  accountButton,
  BREACHED_PASSWORD,
  expectNoA11yViolations,
  FAKE_API,
  lastLink,
  PASSWORD,
  signIn,
  signUp,
  uniqueEmail,
} from "./support/helpers";

test.describe("sign-up to sign-in", () => {
  test("signs up, confirms the e-mail, signs out and signs back in", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);

    await page.goto("/cadastro");
    await expect(page).toHaveTitle("Criar conta · Vira");
    await expectNoA11yViolations(page);

    await page.getByLabel("Nome").fill("Ana Souza");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("Confira seu e-mail")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expectNoA11yViolations(page);

    // The link of the e-mail: the token travels in the fragment and leaves the address bar.
    const { token } = await lastLink(page.request, email);
    await page.goto(`/verificar-email#token=${token}`);
    await expect(page.getByText("E-mail confirmado.")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await expectNoA11yViolations(page);

    // Confirming the e-mail opened the session.
    await accountButton(page).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();

    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/entrar");
    await expectNoA11yViolations(page);
    await signIn(page, email);
    await expect(page).toHaveURL("/");
    await expect(accountButton(page)).toBeVisible();
  });

  test("goes back to the page that asked for the login", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await page.context().clearCookies();

    await page.goto("/conta");
    await expect(page).toHaveURL("/entrar?next=/conta");
    await signIn(page, email);
    await expect(page).toHaveURL("/conta");
    await expect(page.getByRole("heading", { level: 1, name: "Minha conta" })).toBeVisible();
  });

  test("never redirects to another site after the login", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await page.context().clearCookies();

    await page.goto("/entrar?next=//evil.example");
    await signIn(page, email);
    await expect(page).toHaveURL("/");
  });
});

test.describe("form errors", () => {
  test("validate on submit, list the errors on top and focus the first field", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByLabel("Nome", { exact: true })).toBeFocused();
    await expect(page.getByText("Confira 3 campos")).toBeVisible();
    await expect(page.getByLabel("Nome", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAccessibleDescription(
      "Crie uma senha.",
    );
    await expectNoA11yViolations(page);
  });

  test("validate a field when it loses focus, not on every key", async ({ page }) => {
    await page.goto("/cadastro");
    const email = page.getByLabel("E-mail");

    await email.fill("ana");
    await expect(email).not.toHaveAttribute("aria-invalid");
    await email.blur();
    await expect(email).toHaveAccessibleDescription(/e-mail válido/);

    await email.fill("ana@exemplo.com");
    await email.blur();
    await expect(email).not.toHaveAttribute("aria-invalid");
  });

  test("a breached password is refused on its field", async ({ page }, testInfo) => {
    await page.goto("/cadastro");
    await page.getByLabel("Nome").fill("Ana Souza");
    await page.getByLabel("E-mail").fill(uniqueEmail(testInfo));
    await page.getByLabel("Senha", { exact: true }).fill(BREACHED_PASSWORD);
    await page.getByRole("button", { name: "Criar conta" }).click();

    const password = page.getByLabel("Senha", { exact: true });
    await expect(password).toBeFocused();
    await expect(password).toHaveAccessibleDescription(/vazamentos de dados conhecidos/);
  });

  test("a wrong password does not say which part was wrong", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await page.context().clearCookies();

    await page.goto("/entrar");
    await signIn(page, email, "outra senha qualquer");
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

    await page.reload();
    await signIn(page, uniqueEmail(testInfo));
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("an unconfirmed e-mail is explained, with a way out", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await page.goto("/cadastro");
    await page.getByLabel("Nome").fill("Ana Souza");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("Confira seu e-mail")).toBeVisible();

    await page.goto("/entrar");
    await signIn(page, email);
    await expect(page.getByText("Confirme seu e-mail para entrar.")).toBeVisible();
    await expect(
      page.getByRole("status").getByRole("link", { name: "Esqueci minha senha" }),
    ).toBeVisible();
  });
});

test.describe("e-mail links", () => {
  test("an unknown or used link is explained", async ({ page }) => {
    await page.goto(`/verificar-email#token=${"A".repeat(43)}`);
    await expect(page.getByText("Este link expirou ou já foi usado.")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("a link without its token says so", async ({ page }) => {
    await page.goto("/verificar-email");
    await expect(page.getByText("Este link está incompleto.")).toBeVisible();
    await page.goto("/redefinir-senha#token=cortado");
    await expect(page.getByText("Este link está incompleto.")).toBeVisible();
  });

  test("forgot password: request a link, create a new password, sign in with it", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    await page.context().clearCookies();

    await page.goto("/entrar");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL("/esqueci-a-senha");
    await expectNoA11yViolations(page);
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByText(`Se houver uma conta com ${email}`)).toBeVisible();

    const { token } = await lastLink(page.request, email);
    await page.goto(`/redefinir-senha#token=${token}`);
    const field = page.getByLabel("Senha nova");
    await expect(field).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await expectNoA11yViolations(page);

    // A breached password does not spend the link.
    await field.fill(BREACHED_PASSWORD);
    await page.getByRole("button", { name: "Salvar senha nova" }).click();
    await expect(field).toHaveAccessibleDescription(/vazamentos/);

    await field.fill("outra frase longa e segura");
    await page.getByRole("button", { name: "Salvar senha nova" }).click();
    await expect(page.getByText("Senha nova criada.")).toBeVisible();

    await page.getByRole("link", { name: "Entrar" }).last().click();
    await signIn(page, email, "outra frase longa e segura");
    await expect(accountButton(page)).toBeVisible();
  });
});

test.describe("social login", () => {
  test("offers the providers and lands signed in where it started", async ({ page }) => {
    await page.goto("/entrar?next=/conta");
    await expect(page.getByRole("link", { name: "Continuar com Google" })).toBeVisible();

    await page.getByRole("link", { name: "Continuar com GitHub" }).click();
    await expect(page).toHaveURL("/conta");
    await expect(accountButton(page, "Conta Social")).toBeVisible();
    // An account without a password is told how to create one.
    await expect(page.getByText("ainda não tem senha").first()).toBeVisible();
  });

  test("explains why a provider did not sign in", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("link", { name: "Continuar com Google" }).click();
    await expect(page).toHaveURL("/entrar?erro=oauth-email-not-verified");
    await expect(page.getByText(/não tem um e-mail verificado/)).toBeVisible();
  });
});

test.describe("session", () => {
  test("two tabs that find the session expired refresh one after the other", async ({
    page,
    context,
  }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUp(page, email);
    const second = await context.newPage();
    await page.goto("/conta");
    await second.goto("/conta");
    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Ana Souza");
    await expect(second.getByLabel("Nome", { exact: true })).toHaveValue("Ana Souza");

    // Both access tokens expire; both tabs need a refresh at the same moment.
    await page.request.post(`${FAKE_API}/__test/expire-access?email=${encodeURIComponent(email)}`);
    await Promise.all([page.reload(), second.reload()]);

    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Ana Souza");
    await expect(second.getByLabel("Nome", { exact: true })).toHaveValue("Ana Souza");
    const stats = (await (
      await page.request.get(`${FAKE_API}/__test/stats?email=${encodeURIComponent(email)}`)
    ).json()) as { refreshes: number; reuseDetected: number };
    expect(stats.reuseDetected).toBe(0);
    expect(stats.refreshes).toBeGreaterThanOrEqual(1);
  });

  test("an anonymous visit never asks the API who is signed in", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/")) calls.push(request.url());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(calls).toEqual([]);
  });
});
