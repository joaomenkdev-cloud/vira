import { describe, expect, it } from "vitest";

import { ApiError, problemCodeOf, toApiError } from "./errors";
import { messageFor, waitTime } from "./messages";

describe("problemCodeOf", () => {
  it("reads the anchor of the problem type", () => {
    expect(problemCodeOf("https://example.test/docs/API.md#breached-password", 400)).toBe(
      "breached-password",
    );
  });

  it("falls back on the status for unknown or missing types", () => {
    expect(problemCodeOf("about:blank", 429)).toBe("rate-limited");
    expect(problemCodeOf(undefined, 401)).toBe("unauthenticated");
    expect(problemCodeOf("about:blank", 404)).toBe("unknown");
  });
});

describe("toApiError", () => {
  it("survives a body that is not JSON", async () => {
    const error = await toApiError(new Response("<html>not found</html>", { status: 404 }));
    expect(error).toMatchObject({ status: 404, code: "unknown", problem: undefined });
  });

  it("tells a proxy failure (the API is down) from an error of the API", async () => {
    const proxy = await toApiError(new Response("Internal Server Error", { status: 500 }));
    expect(proxy.code).toBe("unavailable");
    expect(messageFor(proxy)).toBe("O servidor do Vira não respondeu. Tente de novo em instantes.");

    const api = await toApiError(
      Response.json({ type: "x#internal-error", title: "Erro", status: 500 }, { status: 500 }),
    );
    expect(api.code).toBe("internal-error");
  });

  it("keeps the field errors", async () => {
    const error = await toApiError(
      Response.json(
        {
          type: "x#breached-password",
          title: "Senha vazada",
          status: 400,
          errors: [{ path: "password", message: "..." }],
        },
        { status: 400 },
      ),
    );
    expect(error.fieldErrors).toEqual([{ path: "password", message: "..." }]);
  });
});

describe("messages", () => {
  it("rounds the wait up to whole minutes", () => {
    expect(waitTime(1)).toBe("1 minuto");
    expect(waitTime(61)).toBe("2 minutos");
  });

  it("explains a rate limit with the time to wait", () => {
    const error = new ApiError({ status: 429, code: "rate-limited", retryAfterSeconds: 300 });
    expect(messageFor(error)).toBe("Muitas tentativas seguidas. Tente de novo em 5 minutos.");
  });

  it("never shows the raw error of an unexpected failure", () => {
    expect(messageFor(new Error("ECONNRESET at 10.0.0.3"))).not.toContain("10.0.0.3");
    expect(messageFor(new ApiError({ status: 500, code: "internal-error" }))).toMatch(
      /Algo deu errado/,
    );
  });
});

describe("messageFor", () => {
  it("shows the API's own sentence for the problems it writes for people", async () => {
    const error = await toApiError(
      Response.json(
        {
          type: "x#invalid-image",
          title: "Imagem inválida",
          status: 422,
          detail: "A imagem precisa ter ao menos 1200 × 600 pixels.",
        },
        { status: 422 },
      ),
    );
    expect(messageFor(error)).toBe("A imagem precisa ter ao menos 1200 × 600 pixels.");
  });

  it("never shows the detail of other problems", async () => {
    const error = await toApiError(
      Response.json(
        { type: "x#internal-error", title: "Erro", status: 500, detail: "stack trace" },
        { status: 500 },
      ),
    );
    expect(messageFor(error)).not.toContain("stack");
  });
});
