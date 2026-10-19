import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

/** The stand-in API, reached directly for its test-only routes (see fake-api.mjs). */
export const FAKE_API = "http://127.0.0.1:3000";
export const PASSWORD = "uma frase longa e segura";
export const BREACHED_PASSWORD = "senha-vazada-123";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}

/** An address no other test (or project) uses. */
export function uniqueEmail(testInfo: TestInfo): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${testInfo.project.name}-${String(Date.now())}-${random}@exemplo.com`;
}

/** The link the stand-in API last "e-mailed" to this address. */
export async function lastLink(
  request: APIRequestContext,
  email: string,
): Promise<{ kind: string; token: string }> {
  const response = await request.get(`${FAKE_API}/__test/mail?to=${encodeURIComponent(email)}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { kind: string; token: string };
}

/** Signs up through the page and confirms the e-mail: the browser ends up signed in. */
export async function signUp(page: Page, email: string, name = "Ana Souza"): Promise<void> {
  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Confira seu e-mail")).toBeVisible();

  const { token } = await lastLink(page.request, email);
  await page.goto(`/verificar-email#token=${token}`);
  await expect(page.getByText("E-mail confirmado.")).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

export function accountButton(page: Page, name = "Ana Souza") {
  return page.getByRole("button", { name: `Conta de ${name}` });
}
