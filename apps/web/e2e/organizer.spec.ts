import { expect, type Page, test } from "@playwright/test";

import { encodePng } from "./fixtures/png.ts";
import { expectNoA11yViolations, FAKE_API, signIn, signUp, uniqueEmail } from "./support/helpers";

/** A wide photo (the panel asks for at least 1200 × 600) and one that is too small. */
const PHOTO = {
  name: "pista.png",
  mimeType: "image/png",
  buffer: encodePng(1600, 900, [
    [217, 45, 58],
    [242, 242, 239],
  ]),
};
const SMALL_PHOTO = {
  ...PHOTO,
  name: "pequena.png",
  buffer: encodePng(800, 400, [
    [0, 0, 0],
    [255, 255, 255],
  ]),
};

/**
 * Console errors and page errors, CSP violations included. The refusals the test asks
 * for (publishing an incomplete draft) are not problems.
 */
function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("status of 409")) problems.push(text);
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

/** Signs up and turns the account into an organizer's (through the stand-in API). */
async function signUpAsOrganizer(page: Page, email: string): Promise<void> {
  await signUp(page, email);
  const response = await page.request.post(
    `${FAKE_API}/__test/make-organizer?email=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
}

/** Calls the API as the signed-in browser does: through the web origin, with the CSRF token. */
async function callApi(page: Page, method: string, path: string, data?: unknown) {
  const csrf = await page.request.get("/api/v1/auth/csrf");
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers: { "x-csrf-token": csrfToken },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.status() === 204
    ? undefined
    : ((await response.json()) as { id: string; slug: string });
}

/** A draft with everything publication needs, made through the API; returns its id. */
async function completeDraft(page: Page, title: string): Promise<string> {
  const event = await callApi(page, "POST", "/organizer/events", {
    title,
    startsAt: "2030-12-08T01:00:00Z",
    endsAt: "2030-12-08T06:00:00Z",
    timezone: "America/Sao_Paulo",
    venue: {
      name: "Circo Voador",
      address: "Rua dos Arcos, s/n",
      city: "Rio de Janeiro",
      state: "RJ",
    },
  });
  const id = event?.id ?? "";
  await callApi(page, "POST", `/organizer/events/${id}/ticket-types`, {
    name: "Pista",
    priceCents: 8000,
    capacity: 200,
  });
  return id;
}

test.describe("organizer panel", () => {
  test("sends a visitor to the login, and back after it", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo);
    await signUpAsOrganizer(page, email);
    await page.context().clearCookies();

    await page.goto("/painel");
    await expect(page).toHaveURL("/entrar?next=/painel");
    await signIn(page, email);
    await expect(page).toHaveURL("/painel");
    await expect(page.getByRole("heading", { name: "Meus eventos", level: 1 })).toBeVisible();
  });

  test("tells an account without an organizer profile where to create one", async ({
    page,
  }, testInfo) => {
    await signUp(page, uniqueEmail(testInfo));
    await page.goto("/painel");
    await expect(
      page.getByRole("heading", { name: "Crie seu perfil de organizador" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ir para minha conta" }).click();
    await expect(page).toHaveURL("/conta#organizador");
    await expect(page.getByLabel("Nome de organizador")).toBeVisible();
  });

  test("takes an event from an empty draft to its public page", async ({ page }, testInfo) => {
    const problems = collectProblems(page);
    await signUpAsOrganizer(page, uniqueEmail(testInfo));

    // The empty panel, reached from the account menu.
    await page.goto("/");
    await page.getByRole("button", { name: "Conta de Ana Souza" }).click();
    await page.getByRole("menuitem", { name: "Meus eventos" }).click();
    await expect(page.getByRole("heading", { name: "Meus eventos", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Seu primeiro evento começa aqui" }),
    ).toBeVisible();
    await expectNoA11yViolations(page);

    // The details: the form checks before sending, the venue goes all or nothing.
    await page.getByRole("link", { name: "Criar evento" }).first().click();
    await expect(page.getByRole("heading", { name: "Criar evento", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page.getByText("Confira 3 campos")).toBeVisible();
    await expect(page.getByLabel("Nome do evento")).toBeFocused();
    await expectNoA11yViolations(page);

    await page.getByLabel("Nome do evento").fill("Noite de forró no Circo");
    await page.getByLabel("Começa em").fill("2030-12-07T22:00");
    await page.getByLabel("Termina em").fill("2030-12-07T21:00");
    await page.getByLabel("Nome do local").fill("Circo Voador");
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page.getByLabel("Termina em")).toHaveAccessibleDescription(
      "O fim precisa ser depois do início.",
    );
    await expect(page.getByLabel("Endereço")).toHaveAccessibleDescription("Informe o endereço.");
    await expect(page.getByRole("combobox", { name: "UF" })).toHaveAccessibleDescription(
      "Escolha a UF.",
    );

    await page.getByLabel("Termina em").fill("2030-12-08T03:00");
    await page.getByLabel("Endereço").fill("Rua dos Arcos, s/n – Lapa");
    await page.getByLabel("Cidade").fill("Rio de Janeiro");
    await page.getByRole("combobox", { name: "UF" }).click();
    await page.getByRole("option", { name: "RJ" }).click();
    await page.getByLabel("Sobre o evento").fill("Forró pé de serra a noite toda.");
    await page.getByRole("button", { name: "Criar rascunho" }).click();

    // The draft's page: what publishing still needs, and the API's own refusal.
    await expect(page).toHaveURL(/\/painel\/eventos\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { name: "Noite de forró no Circo", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();
    // Typed on the event's clock (Brasília), whatever the browser's zone.
    await expect(page.getByText("sábado, 7 de dezembro · 22:00 – 03:00")).toBeVisible();
    await page.getByRole("button", { name: "Publicar evento" }).click();
    const refusal = page.getByRole("alert").filter({ hasText: "Ainda falta algo para publicar." });
    await expect(refusal).toContainText("Envie a imagem do evento");
    await expect(refusal).toContainText("Crie ao menos um tipo de ingresso");
    await expectNoA11yViolations(page);

    // The picture: checked in the browser, sent to the bucket, confirmed by the API.
    await page.getByLabel("Arquivo da imagem").setInputFiles(SMALL_PHOTO);
    await expect(page.getByLabel("Arquivo da imagem")).toHaveAccessibleDescription(
      /ao menos 1200 × 600 pixels; esta tem 800 × 400/,
    );
    await page.getByLabel("Arquivo da imagem").setInputFiles(PHOTO);
    await expect(page.getByRole("img", { name: "Prévia da imagem escolhida" })).toBeVisible();
    await page.getByRole("button", { name: "Enviar imagem" }).click();
    await expect(page.getByLabel("Descrição da imagem")).toHaveAccessibleDescription(
      "Descreva a imagem para quem não pode vê-la.",
    );
    await page.getByLabel("Descrição da imagem").fill("Pista cheia sob a lona do Circo Voador");
    await page.getByRole("button", { name: "Enviar imagem" }).click();
    await expect(page.getByText("Imagem atualizada.")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Pista cheia sob a lona do Circo Voador" }),
    ).toBeVisible();

    // A ticket type, in a modal (a bottom sheet on a phone).
    await page.getByRole("button", { name: "Adicionar tipo de ingresso" }).click();
    const dialog = page.getByRole("dialog", { name: "Novo tipo de ingresso" });
    await dialog.getByLabel("Nome").fill("Pista – Lote 1");
    await dialog.getByLabel("Preço (R$)").fill("0,50");
    await dialog.getByLabel("Quantidade").fill("200");
    await dialog.getByRole("button", { name: "Adicionar tipo de ingresso" }).click();
    await expect(dialog.getByLabel("Preço (R$)")).toHaveAccessibleDescription(
      "O preço vai de R$ 1,00 a R$ 100.000,00.",
    );
    await expectNoA11yViolations(page);
    await dialog.getByLabel("Preço (R$)").fill("80,00");
    await dialog.getByRole("button", { name: "Adicionar tipo de ingresso" }).click();
    await expect(dialog).toBeHidden();
    const ticketTypes = page.getByRole("region", { name: "Ingressos" });
    await expect(ticketTypes).toContainText("Pista – Lote 1");
    await expect(ticketTypes).toContainText("R$ 80,00");
    await expect(ticketTypes).toContainText("0 vendidos de 200 · até 10 por pedido");

    // Published: on the storefront, with what was typed in the panel.
    await page.getByRole("button", { name: "Publicar evento" }).click();
    await expect(page.getByText("Evento publicado.")).toBeVisible();
    await expect(page.getByText("Publicado", { exact: true })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole("link", { name: "Ver página do evento" }).click();
    await expect(page).toHaveURL(/\/eventos\/noite-de-forro-no-circo-[0-9a-f]{6}$/);
    await expect(
      page.getByRole("heading", { name: "Noite de forró no Circo", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Pista – Lote 1")).toBeVisible();
    await expect(page.getByText("Forró pé de serra a noite toda.")).toBeVisible();

    await page.goto("/painel?status=publicados");
    const row = page.getByRole("article").filter({ hasText: "Noite de forró no Circo" });
    await expect(row).toContainText("SÁB, 7 DEZ 2030 · 22:00");
    await expect(row).toContainText("Circo Voador · Rio de Janeiro · 1 tipo de ingresso");
    await expect(row).toContainText("Publicado");
    await page.goto("/painel?status=rascunhos");
    await expect(page.getByRole("heading", { name: "Nenhum evento em “Rascunhos”" })).toBeVisible();

    expect(problems).toEqual([]);
  });

  test("edits a draft and its ticket types, then deletes it", async ({ page }, testInfo) => {
    await signUpAsOrganizer(page, uniqueEmail(testInfo));
    const id = await completeDraft(page, "Sarau de quinta");
    await page.goto(`/painel/eventos/${id}`);

    await page.getByLabel("Nome do evento").fill("Sarau de sexta");
    await page.getByRole("button", { name: "Salvar detalhes" }).click();
    await expect(page.getByText("Alterações salvas.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sarau de sexta", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Editar Pista" }).click();
    const dialog = page.getByRole("dialog", { name: "Editar “Pista”" });
    await expect(dialog.getByLabel("Preço (R$)")).toHaveValue("80,00");
    await dialog.getByLabel("Preço (R$)").fill("95,50");
    await dialog.getByRole("button", { name: "Salvar tipo de ingresso" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Ingressos" })).toContainText("R$ 95,50");

    await page.getByRole("button", { name: "Excluir Pista" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Nenhum tipo de ingresso ainda")).toBeVisible();

    await page.getByRole("button", { name: "Excluir rascunho" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir rascunho" }).click();
    await expect(page).toHaveURL("/painel");
    await expect(
      page.getByRole("heading", { name: "Seu primeiro evento começa aqui" }),
    ).toBeVisible();
  });

  test("cancels a published event for good", async ({ page }, testInfo) => {
    await signUpAsOrganizer(page, uniqueEmail(testInfo));
    const id = await completeDraft(page, "Show na praia");
    // The picture goes through the panel: the API only takes one that reached the bucket.
    await page.goto(`/painel/eventos/${id}`);
    await page.getByLabel("Arquivo da imagem").setInputFiles(PHOTO);
    await page.getByLabel("Descrição da imagem").fill("Palco na areia ao pôr do sol");
    await page.getByRole("button", { name: "Enviar imagem" }).click();
    await expect(page.getByText("Imagem atualizada.")).toBeVisible();
    await page.getByRole("button", { name: "Publicar evento" }).click();
    await expect(page.getByText("Evento publicado.")).toBeVisible();

    await page.getByRole("button", { name: "Cancelar evento" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancelar este evento?" });
    await dialog.getByRole("button", { name: "Cancelar evento" }).click();
    await expect(dialog.getByLabel("Motivo")).toHaveAccessibleDescription(
      "Conte a quem comprou por que o evento foi cancelado.",
    );
    await expectNoA11yViolations(page);
    await dialog.getByLabel("Motivo").fill("Previsão de tempestade na orla.");
    await dialog.getByRole("button", { name: "Cancelar evento" }).click();

    await expect(
      page.getByText("Este evento foi cancelado e não pode mais ser alterado."),
    ).toBeVisible();
    await expect(page.getByText("Motivo informado: Previsão de tempestade na orla.")).toBeVisible();
    await expect(page.getByLabel("Nome do evento")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Adicionar tipo de ingresso" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar detalhes" })).toHaveCount(0);
  });

  test("answers 'not found' for an event that is not the organizer's", async ({
    page,
  }, testInfo) => {
    await signUpAsOrganizer(page, uniqueEmail(testInfo));
    await page.goto("/painel/eventos/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Evento não encontrado" })).toBeVisible();
  });
});
