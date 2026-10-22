import { expect, test, type Page } from "@playwright/test";

import { FAKE_CAMERA_TOKEN } from "./support/fake-camera";
import { expectNoA11yViolations, FAKE_API, signUp, uniqueEmail } from "./support/helpers";

interface Door {
  eventId: string;
  tickets: { code: string; token: string }[];
}

async function signUpAsOrganizer(page: Page, email: string): Promise<void> {
  await signUp(page, email);
  const response = await page.request.post(
    `${FAKE_API}/__test/make-organizer?email=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
}

/** An event of the organizer on tonight, with one ticket per holder, straight from the API. */
async function door(
  page: Page,
  email: string,
  { title = "Noite de forró", holders = "Ana Souza", statuses = "", token = "" } = {},
): Promise<Door> {
  const query = new URLSearchParams({ email, title, holders, statuses, token });
  const response = await page.request.post(`${FAKE_API}/__test/checkin/event?${query.toString()}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Door;
}

function ticketAt(event: Door, index: number) {
  const ticket = event.tickets[index];
  if (!ticket) throw new Error(`no ticket ${String(index)}`);
  return ticket;
}

test.describe("check-in", () => {
  test("validates typed codes and tells each result apart", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUpAsOrganizer(page, email);
    const forro = await door(page, email, {
      holders: "Ana Souza,Caio Lima,Bia Reis",
      statuses: "VALID,VALID,CANCELED",
    });
    const samba = await door(page, email, { title: "Roda de samba", holders: "Davi Melo" });
    const [ana, , bia] = [ticketAt(forro, 0), ticketAt(forro, 1), ticketAt(forro, 2)];

    // The way in: from the event in the panel.
    await page.goto(`/painel/eventos/${forro.eventId}`);
    await page.getByRole("link", { name: "Abrir check-in" }).click();
    await expect(page).toHaveURL(new RegExp(`/painel/eventos/${forro.eventId}/check-in$`));
    await expect(page.getByRole("heading", { level: 1, name: "Noite de forró" })).toBeVisible();
    await expect(page.getByText("0 de 2 ingressos entraram")).toBeVisible();
    await expect(page.getByText("Aguardando a leitura de um ingresso.")).toBeVisible();
    await expectNoA11yViolations(page);

    const code = page.getByLabel("Código do ingresso");
    const result = page.getByRole("region", { name: "Resultado da leitura" });

    // Typed the way people type: lower case, without the prefix.
    await code.fill(ana.code.toLowerCase().replace("vira-", ""));
    await page.getByRole("button", { name: "Validar código" }).click();
    await expect(result.getByText("Válido", { exact: true })).toBeVisible();
    await expect(result).toContainText("Entrada liberada.");
    await expect(result).toContainText("Ana Souza");
    await expect(result).toContainText(ana.code);
    await expect(code).toHaveValue("");
    await expect(page.getByText("1 de 2 ingressos entraram")).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "Ler próximo" }).click();
    await expect(page.getByText("Aguardando a leitura de um ingresso.")).toBeVisible();

    const typeCode = async (value: string) => {
      await code.fill(value);
      await page.getByRole("button", { name: "Validar código" }).click();
    };

    await typeCode(ana.code);
    await expect(result.getByText(/^Já utilizado às \d\d:\d\d$/)).toBeVisible();
    await expect(result).toContainText("Não libere a entrada.");
    await expectNoA11yViolations(page);

    await typeCode(bia.code);
    await expect(result.getByText("Cancelado", { exact: true })).toBeVisible();
    await expect(result).toContainText("Bia Reis");

    await typeCode(ticketAt(samba, 0).code);
    await expect(result.getByText("Outro evento", { exact: true })).toBeVisible();
    await expect(result).not.toContainText("Davi Melo");

    await typeCode("VIRA-0000-0000");
    await expect(result.getByText("Inválido", { exact: true })).toBeVisible();
    await expectNoA11yViolations(page);

    // A code too short never leaves the page.
    await typeCode("VIRA-12");
    await expect(page.getByText("Digite os 8 caracteres do código")).toBeVisible();

    const lastScans = page.getByRole("region", { name: "Entradas" }).getByRole("listitem");
    await expect(lastScans).toHaveCount(5);
    await expect(lastScans.first()).toContainText("Inválido");
    await expect(lastScans.last()).toContainText("Ana Souza");
  });

  test("reads a QR with the camera, once", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUpAsOrganizer(page, email);
    const event = await door(page, email, { holders: "Ana Souza", token: FAKE_CAMERA_TOKEN });

    const response = await page.goto(`/painel/eventos/${event.eventId}/check-in`);
    // This page alone may ask for the camera.
    expect(response?.headers()["permissions-policy"]).toContain("camera=(self)");
    await page.getByRole("button", { name: "Ligar câmera" }).click();

    const result = page.getByRole("region", { name: "Resultado da leitura" });
    await expect(result.getByText("Válido", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(result).toContainText("Ana Souza");
    // The camera stays on but waits: the same QR in front of it is not read again.
    await expect(page.getByRole("button", { name: "Desligar câmera" })).toBeVisible();
    await expect(page.getByText("1 de 1 ingresso entrou")).toBeVisible();

    await page.getByRole("button", { name: "Ler próximo" }).click();
    await expect(result.getByText(/^Já utilizado às \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "Desligar câmera" }).click();
    await expect(page.getByRole("button", { name: "Ligar câmera" })).toBeVisible();
  });

  test("keeps the camera off everywhere else", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.headers()["permissions-policy"]).toContain("camera=()");
  });

  test("opens only the organizer's own events", async ({ page, browser }, testInfo) => {
    const owner = uniqueEmail(testInfo);
    await signUpAsOrganizer(page, owner);
    const event = await door(page, owner);

    const other = await browser.newContext();
    const intruder = await other.newPage();
    await signUpAsOrganizer(intruder, `outra-${owner}`);
    await intruder.goto(`/painel/eventos/${event.eventId}/check-in`);
    await expect(intruder.getByRole("heading", { name: "Evento não encontrado" })).toBeVisible();
    await other.close();

    const visitor = await browser.newContext();
    const anonymous = await visitor.newPage();
    await anonymous.goto(`/painel/eventos/${event.eventId}/check-in`);
    await expect(anonymous).toHaveURL(/\/entrar\?next=/);
    await visitor.close();
  });
});
