import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("is a multi-line text box named by its label", () => {
    render(<Textarea label="Descrição" />);
    const field = screen.getByRole("textbox", { name: "Descrição" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAttribute("aria-required", "true");
  });

  it("takes text, with line breaks", async () => {
    render(<Textarea label="Descrição" />);
    await userEvent.type(screen.getByRole("textbox"), "Linha 1{Enter}Linha 2");
    expect(screen.getByRole("textbox")).toHaveValue("Linha 1\nLinha 2");
  });

  it("marks an optional field", () => {
    render(<Textarea label="Observações" optional />);
    expect(screen.getByText("(opcional)")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-required");
  });

  it("describes itself with the hint, then with the error", () => {
    const { rerender } = render(<Textarea label="Descrição" hint="Aceita Markdown." />);
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Aceita Markdown.");

    rerender(
      <Textarea
        label="Descrição"
        hint="Aceita Markdown."
        error="Escreva ao menos 20 caracteres."
      />,
    );
    const field = screen.getByRole("textbox");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Escreva ao menos 20 caracteres.");
    expect(field).toHaveClass("border-danger");
  });

  it("is disabled and looks it", () => {
    render(<Textarea label="Descrição" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveClass("disabled:bg-surface-sunken");
  });
});
