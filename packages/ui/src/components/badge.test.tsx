import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("shows its text", () => {
    render(<Badge>Demonstração</Badge>);
    expect(screen.getByText("Demonstração")).toBeInTheDocument();
  });

  it("is neutral by default", () => {
    render(<Badge>Rascunho</Badge>);
    expect(screen.getByText("Rascunho")).toHaveClass("bg-surface-sunken", "text-ink");
  });

  it.each([
    ["neutral", "bg-surface-sunken", "text-ink"],
    // Red text on accent-soft is accent-ink, never accent (4.19:1 fails AA).
    ["accent", "bg-accent-soft", "text-accent-ink"],
    ["success", "bg-success-bg", "text-success"],
    ["warning", "bg-warning-bg", "text-warning"],
    ["danger", "bg-danger-bg", "text-danger"],
    ["on-image", "bg-surface", "text-ink"],
  ] as const)("renders the %s variant", (variant, background, text) => {
    render(<Badge variant={variant}>Estado</Badge>);
    expect(screen.getByText("Estado")).toHaveClass(background, text);
  });

  it("is 24 px tall", () => {
    render(<Badge>Pago</Badge>);
    expect(screen.getByText("Pago")).toHaveClass("h-6");
  });

  it("is a pill over a photograph and a small rectangle elsewhere", () => {
    render(
      <>
        <Badge variant="on-image">Esgotado</Badge>
        <Badge variant="success">Pago</Badge>
      </>,
    );
    expect(screen.getByText("Esgotado")).toHaveClass("rounded-full");
    expect(screen.getByText("Pago")).toHaveClass("rounded-sm");
  });

  it("is not interactive and has no role of its own", () => {
    render(<Badge>Pago</Badge>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Pago").tagName).toBe("SPAN");
  });
});
