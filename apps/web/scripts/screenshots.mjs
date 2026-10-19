// Captures the screenshots that interface pull requests must include (desktop and mobile).
// Needs the production server running:
// `pnpm --filter @vira/web build && VIRA_DESIGN_SYSTEM=true pnpm --filter @vira/web start`,
// and an API: the stand-in of the end-to-end tests (`node e2e/fake-api.ts`, whose events
// are all test fixtures marked "Demonstração") or a real one with published events.
// The signed-in pages need an API that sends no real e-mail: use the stand-in and set
// FAKE_API_URL=http://127.0.0.1:3000.
// The page.evaluate callback below runs in the browser.
/* global document, window */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium, devices } from "@playwright/test";

import { encodePng } from "../e2e/fixtures/png.ts";

const baseUrl = process.env["WEB_URL"] ?? "http://127.0.0.1:3001";
const outDir =
  process.env["SCREENSHOT_DIR"] ??
  join(import.meta.dirname, "..", "..", "..", "docs", "assets", "screenshots");
const fakeApiUrl = process.env["FAKE_API_URL"];
const pages = [
  { name: "home", path: "/" },
  { name: "explore", path: "/eventos" },
  { name: "explore-empty-search", path: "/eventos?q=maracatu" },
  { name: "event", path: "/eventos/forro-na-praca" },
  { name: "login", path: "/entrar" },
  { name: "sign-up", path: "/cadastro" },
  { name: "forgot-password", path: "/esqueci-a-senha" },
  { name: "not-found", path: "/esta-pagina-nao-existe" },
  // Served by a production build only with VIRA_DESIGN_SYSTEM=true.
  { name: "design-system", path: "/dev/design-system" },
];
const viewports = [
  { name: "desktop", options: { viewport: { width: 1280, height: 800 } } },
  { name: "mobile", options: { ...devices["Pixel 7"] } },
];

async function shoot(page, file, fullPage = true) {
  const path = join(outDir, file);
  // A page scrolled by a form (errors, notices) would show its sticky header mid-capture.
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage });
  process.stdout.write(`${path}\n`);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const viewport of viewports) {
    const context = await browser.newContext(viewport.options);
    const page = await context.newPage();
    for (const { name, path } of pages) {
      await page.goto(`${baseUrl}${path}`);
      await page.waitForLoadState("networkidle");
      // Photos below the fold load lazily: scroll through the page so they are all there.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState("networkidle");
      await shoot(page, `web-${name}-${viewport.name}.png`);
    }

    // A form that failed validation: the summary on top and the messages on the fields.
    await page.goto(`${baseUrl}/cadastro`);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByText("Confira 3 campos").waitFor();
    await shoot(page, `web-sign-up-errors-${viewport.name}.png`);

    if (fakeApiUrl) {
      // Sign up and confirm the e-mail through the stand-in API, then show the account.
      const email = `prints-${viewport.name}-${String(Date.now())}@exemplo.com`;
      await page.getByLabel("Nome", { exact: true }).fill("Ana Souza");
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Senha", { exact: true }).fill("uma frase longa e segura");
      await page.getByRole("button", { name: "Criar conta" }).click();
      await page.getByText("Confira seu e-mail").waitFor();
      await shoot(page, `web-sign-up-sent-${viewport.name}.png`);

      const mail = await (await fetch(`${fakeApiUrl}/__test/mail?to=${email}`)).json();
      await page.goto(`${baseUrl}/verificar-email#token=${mail.token}`);
      await page.getByText("E-mail confirmado.").waitFor();
      await shoot(page, `web-email-verified-${viewport.name}.png`);

      await page.goto(`${baseUrl}/conta`);
      await page.getByText("Esta sessão").waitFor();
      await shoot(page, `web-account-${viewport.name}.png`);

      await page.getByRole("button", { name: "Conta de Ana Souza" }).click();
      await page.getByRole("menu").waitFor();
      await page.waitForTimeout(500);
      await shoot(page, `web-account-menu-${viewport.name}.png`, false);
      await page.keyboard.press("Escape");

      // The organizer panel: empty, the new event form, a draft, a published event.
      await fetch(`${fakeApiUrl}/__test/make-organizer?email=${email}`, { method: "POST" });
      await page.goto(`${baseUrl}/painel`);
      await page.getByText("Seu primeiro evento começa aqui").waitFor();
      await shoot(page, `web-organizer-empty-${viewport.name}.png`);

      await page.goto(`${baseUrl}/painel/eventos/novo`);
      await page.getByRole("button", { name: "Criar rascunho" }).click();
      await page.getByText("Confira 3 campos").waitFor();
      await shoot(page, `web-organizer-new-event-${viewport.name}.png`);

      await page.getByLabel("Nome do evento").fill("Noite de forró no Circo");
      await page.getByLabel("Começa em").fill("2030-12-07T22:00");
      await page.getByLabel("Termina em").fill("2030-12-08T03:00");
      await page.getByLabel("Nome do local").fill("Circo Voador");
      await page.getByLabel("Endereço").fill("Rua dos Arcos, s/n – Lapa");
      await page.getByLabel("Cidade").fill("Rio de Janeiro");
      await page.getByRole("combobox", { name: "UF" }).click();
      await page.getByRole("option", { name: "RJ" }).click();
      await page.getByLabel("Sobre o evento").fill("Forró pé de serra a noite toda.");
      await page.getByRole("button", { name: "Criar rascunho" }).click();
      await page.getByRole("button", { name: "Publicar evento" }).waitFor();
      await shoot(page, `web-organizer-draft-${viewport.name}.png`);

      await page.getByLabel("Arquivo da imagem").setInputFiles({
        name: "foto.png",
        mimeType: "image/png",
        buffer: encodePng(1800, 1200, [
          [217, 45, 58],
          [242, 242, 239],
        ]),
      });
      await page.getByLabel("Descrição da imagem").fill("Faixas em vermelho e branco");
      await page.getByRole("button", { name: "Enviar imagem" }).click();
      await page.getByText("Imagem atualizada.").waitFor();
      await page.getByRole("button", { name: "Adicionar tipo de ingresso" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Nome").fill("Pista – Lote 1");
      await dialog.getByLabel("Preço (R$)").fill("80,00");
      await dialog.getByLabel("Quantidade").fill("200");
      await page.waitForTimeout(500);
      await shoot(page, `web-organizer-ticket-type-${viewport.name}.png`, false);
      await dialog.getByRole("button", { name: "Adicionar tipo de ingresso" }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Publicar evento" }).click();
      await page.getByText("Evento publicado.").waitFor();
      await page.waitForLoadState("networkidle");
      await shoot(page, `web-organizer-published-${viewport.name}.png`);

      await page.goto(`${baseUrl}/painel`);
      await page.getByRole("article").first().waitFor();
      await shoot(page, `web-organizer-list-${viewport.name}.png`);
    }

    // Open layers cannot show in a full-page capture of the closed page: photograph them
    // on their own (the modal is a card on a desktop and a bottom sheet on a phone).
    await page.goto(`${baseUrl}/dev/design-system`);
    await page.waitForLoadState("networkidle");
    const overlays = [
      { name: "modal", open: "Confirmação (480 px)", ready: () => page.getByRole("dialog") },
      { name: "menu", open: "Ações", ready: () => page.getByRole("menu") },
    ];
    for (const { name, open, ready } of overlays) {
      await page.getByRole("button", { name: open }).scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: open }).click();
      await ready().waitFor();
      // Wait for the enter animation (320 ms at most) before the shot.
      await page.waitForTimeout(500);
      await shoot(page, `web-${name}-${viewport.name}.png`, false);
      await page.keyboard.press("Escape");
      await ready().waitFor({ state: "hidden" });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
