import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert } from "./alert";

describe("Alert", () => {
  it("shows the title and the message", () => {
    render(
      <Alert variant="success" title="Pagamento confirmado">
        Enviamos o ingresso para seu e-mail.
      </Alert>,
    );
    expect(screen.getByText("Pagamento confirmado")).toBeInTheDocument();
    expect(screen.getByText("Enviamos o ingresso para seu e-mail.")).toBeInTheDocument();
  });

  it("announces errors at once", () => {
    render(<Alert variant="danger" title="Pagamento recusado" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Pagamento recusado");
  });

  it.each(["success", "warning", "info"] as const)(
    "announces the %s variant politely, as a status",
    (variant) => {
      render(<Alert variant={variant} title="Aviso" />);
      expect(screen.getByRole("status")).toHaveTextContent("Aviso");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("is a neutral information message by default", () => {
    render(<Alert title="Este é um evento de demonstração" />);
    expect(screen.getByRole("status")).toHaveClass("bg-info-bg", "text-info");
  });

  it.each([
    ["success", "bg-success-bg", "text-success"],
    ["warning", "bg-warning-bg", "text-warning"],
    ["danger", "bg-danger-bg", "text-danger"],
    ["info", "bg-info-bg", "text-info"],
  ] as const)("colours the %s variant from its tokens", (variant, background, text) => {
    render(<Alert variant={variant} title="Estado" />);
    expect(screen.getByRole(variant === "danger" ? "alert" : "status")).toHaveClass(
      background,
      text,
    );
  });

  it.each(["success", "warning", "danger", "info"] as const)(
    "carries the %s state in an icon too, not in colour alone",
    (variant) => {
      render(<Alert variant={variant} title="Estado" />);
      const icon = screen.getByRole(variant === "danger" ? "alert" : "status").querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("has no coloured side border", () => {
    render(<Alert variant="danger" title="Erro" />);
    expect(screen.getByRole("alert").className).not.toMatch(/border-l|border-s/);
  });

  it("renders without a title or a message", () => {
    render(<Alert variant="info">Só o texto.</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Só o texto.");
  });

  it("passes other attributes through", () => {
    render(<Alert title="Aviso" data-testid="aviso" />);
    expect(screen.getByTestId("aviso")).toBe(screen.getByRole("status"));
  });
});
