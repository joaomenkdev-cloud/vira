import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import type { AppConfig } from "../config/config.schema.js";

export const DOCS_PATH = "docs";

/**
 * Serves the OpenAPI document at `/docs` (UI) and `/docs/json`. Schemas come from
 * the Zod contracts in `@vira/shared` through Standard Schema (ADR-0003).
 * Disabled by default in production (docs/SECURITY_MODEL.md, API9).
 */
export function setupOpenApi(app: INestApplication, config: AppConfig): void {
  if (!config.docs.enabled) return;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Vira API")
      .setDescription(
        "API REST do Vira. Erros seguem a RFC 9457 (`application/problem+json`). " +
          "Pagamentos sempre em modo de teste do Stripe.",
      )
      .setVersion("1")
      .setLicense("MIT", "https://github.com/joaomenkdev-cloud/vira/blob/main/LICENSE")
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}/json`,
    yamlDocumentUrl: `${DOCS_PATH}/yaml`,
  });
}
