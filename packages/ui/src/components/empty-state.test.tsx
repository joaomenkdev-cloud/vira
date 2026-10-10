import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("is a region named by its title, with one sentence", () => {
    render(
      <EmptyState title="Nenhum evento por aqui ainda">
        Quando organizadores publicarem eventos, eles aparecem nesta página.
      </EmptyState>,
    );
    expect(
      screen.getByRole("region", { name: "Nenhum evento por aqui ainda" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quando organizadores publicarem eventos, eles aparecem nesta página."),
    ).toBeInTheDocument();
  });

  it("titles itself with a level-3 heading by default, or level 2 when asked", () => {
    const { rerender } = render(<EmptyState title="Vazio">Nada.</EmptyState>);
    expect(screen.getByRole("heading", { level: 3, name: "Vazio" })).toBeInTheDocument();
    rerender(
      <EmptyState title="Vazio" headingLevel={2}>
        Nada.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Vazio" })).toBeInTheDocument();
  });

  it("shows at most one action, when there is one", () => {
    const { rerender } = render(<EmptyState title="Vazio">Nada.</EmptyState>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(
      <EmptyState title="Vazio" action={<Button>Criar evento</Button>}>
        Nada.
      </EmptyState>,
    );
    expect(screen.getByRole("button", { name: "Criar evento" })).toBeInTheDocument();
  });

  it("gives two empty states on one page distinct names", () => {
    render(
      <>
        <EmptyState title="Primeiro">Nada.</EmptyState>
        <EmptyState title="Segundo">Nada.</EmptyState>
      </>,
    );
    expect(screen.getByRole("region", { name: "Primeiro" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Segundo" })).toBeInTheDocument();
  });

  it("draws the perforated line as the only decoration, hidden from assistive technology", () => {
    const { container } = render(<EmptyState title="Vazio">Nada.</EmptyState>);
    const line = container.querySelector("[aria-hidden='true']");
    expect(line).toHaveClass("border-dashed", "border-t-2");
    expect(container.querySelector("svg, img")).toBeNull();
  });

  it("is centred in 420 px with 64 px of air above and below", () => {
    render(<EmptyState title="Vazio">Nada.</EmptyState>);
    expect(screen.getByRole("region")).toHaveClass("max-w-empty-state", "text-center", "py-16");
  });
});
