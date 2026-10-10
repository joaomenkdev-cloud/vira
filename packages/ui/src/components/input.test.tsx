import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Input, PasswordInput, SearchInput } from "./input";

describe("Input", () => {
  it("is named by its visible label", () => {
    render(<Input label="Nome completo" />);
    expect(screen.getByLabelText("Nome completo")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nome completo" })).toBeInTheDocument();
  });

  it("is required unless it says otherwise", () => {
    render(<Input label="Nome" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-required", "true");
  });

  it("marks an optional field in its label and does not require it", () => {
    render(<Input label="Telefone" optional />);
    expect(screen.getByText("(opcional)")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-required");
  });

  it("uses the 48 px height by default and 44 px on request", () => {
    const { rerender } = render(<Input label="Nome" />);
    expect(screen.getByRole("textbox")).toHaveClass("h-12");
    rerender(<Input label="Nome" fieldSize="md" />);
    expect(screen.getByRole("textbox")).toHaveClass("h-11");
  });

  it("keeps the text at 16 px so iOS does not zoom in", () => {
    render(<Input label="Nome" />);
    expect(screen.getByRole("textbox")).toHaveClass("text-body");
  });

  describe("hint", () => {
    it("describes the field", () => {
      render(<Input label="Código" hint="Seis dígitos, enviados por e-mail." />);
      expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
        "Seis dígitos, enviados por e-mail.",
      );
    });
  });

  describe("error", () => {
    it("marks the field invalid and describes it with the message", () => {
      render(<Input label="E-mail" error="Informe um e-mail válido." type="email" />);
      const field = screen.getByRole("textbox", { name: "E-mail" });
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription("Informe um e-mail válido.");
      expect(field).toHaveAttribute("aria-describedby", expect.stringContaining("-error"));
    });

    it("draws the message with an icon, not in colour alone", () => {
      render(<Input label="E-mail" error="Informe um e-mail válido." />);
      const message = screen.getByText("Informe um e-mail válido.").closest("p");
      expect(message?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    it("uses the danger border", () => {
      render(<Input label="E-mail" error="Informe um e-mail válido." />);
      expect(screen.getByRole("textbox")).toHaveClass("border-danger");
    });

    it("replaces the hint while there is an error", () => {
      render(<Input label="Código" hint="Seis dígitos." error="Código incorreto." />);
      expect(screen.queryByText("Seis dígitos.")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Código incorreto.");
    });

    it("is valid when there is no error", () => {
      render(<Input label="Nome" />);
      expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
    });
  });

  describe("states", () => {
    it("styles hover and focus on a valid field", () => {
      render(<Input label="Nome" />);
      expect(screen.getByRole("textbox")).toHaveClass(
        "border-line-strong",
        "enabled:hover:border-ink-muted",
        "enabled:focus-visible:border-ink",
      );
    });

    it("is disabled and looks it", async () => {
      render(<Input label="Nome" disabled />);
      const field = screen.getByRole("textbox");
      expect(field).toBeDisabled();
      expect(field).toHaveClass("disabled:bg-surface-sunken", "disabled:text-ink-subtle");
      await userEvent.type(field, "x");
      expect(field).toHaveValue("");
    });

    it("takes keyboard focus and input", async () => {
      render(<Input label="Nome" />);
      await userEvent.tab();
      expect(screen.getByRole("textbox")).toHaveFocus();
      await userEvent.keyboard("Maria");
      expect(screen.getByRole("textbox")).toHaveValue("Maria");
    });

    it("lets the global focus ring show", () => {
      render(<Input label="Nome" />);
      expect(screen.getByRole("textbox").className).not.toMatch(/outline-none|outline-hidden/);
    });
  });

  describe("types", () => {
    it("fills e-mail addresses by autocomplete", () => {
      render(<Input label="E-mail" type="email" />);
      expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "email");
      expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
    });

    it("accepts the native date and time types", () => {
      render(
        <>
          <Input label="Data" type="date" />
          <Input label="Hora" type="time" />
        </>,
      );
      expect(screen.getByLabelText("Data")).toHaveAttribute("type", "date");
      expect(screen.getByLabelText("Hora")).toHaveAttribute("type", "time");
    });

    it("lets the caller choose the autocomplete token", () => {
      render(<Input label="Nome" autoComplete="name" />);
      expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "name");
    });
  });

  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    render(<Input label="Nome" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "ab");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("PasswordInput", () => {
  it("hides the password and asks for the current one by default", () => {
    render(<PasswordInput label="Senha" />);
    const field = screen.getByLabelText("Senha");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "current-password");
  });

  it("asks the browser to offer a new password when creating one", () => {
    render(<PasswordInput label="Senha" autoComplete="new-password" />);
    expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "new-password");
  });

  it("shows and hides the password with a toggle that reports its state", async () => {
    render(<PasswordInput label="Senha" />);
    const toggle = screen.getByRole("button", { name: "Mostrar senha" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "text");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  });

  it("keeps the toggle name constant, as the pressed state already says the rest", async () => {
    render(<PasswordInput label="Senha" />);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument();
  });

  it("is reachable by keyboard right after the field", async () => {
    render(<PasswordInput label="Senha" />);
    await userEvent.tab();
    expect(screen.getByLabelText("Senha")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toHaveFocus();
  });

  it("reports an error like any other field", () => {
    render(<PasswordInput label="Senha" error="Senha incorreta." />);
    expect(screen.getByLabelText("Senha")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Senha")).toHaveAccessibleDescription("Senha incorreta.");
  });

  it("disables the toggle with the field", () => {
    render(<PasswordInput label="Senha" disabled />);
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeDisabled();
  });
});

describe("SearchInput", () => {
  it("is a search box named by its label, which stays out of sight", () => {
    render(<SearchInput label="Buscar eventos" />);
    const box = screen.getByRole("searchbox", { name: "Buscar eventos" });
    expect(box).toBeInTheDocument();
    expect(screen.getByText("Buscar eventos")).toHaveClass("sr-only");
  });

  it("can show the label", () => {
    render(<SearchInput label="Buscar eventos" showLabel />);
    expect(screen.getByText("Buscar eventos")).not.toHaveClass("sr-only");
  });

  it("has no clear button while empty and gets one once there is text", async () => {
    render(<SearchInput label="Buscar eventos" />);
    expect(screen.queryByRole("button", { name: "Limpar busca" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "rock");
    expect(screen.getByRole("button", { name: "Limpar busca" })).toBeInTheDocument();
  });

  it("clears the text, gives the focus back and reports it", async () => {
    const onClear = vi.fn();
    render(<SearchInput label="Buscar eventos" defaultValue="rock" onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Limpar busca" })).not.toBeInTheDocument();
  });

  it("works controlled", async () => {
    function Controlled() {
      const [text, setText] = useState("jazz");
      return (
        <SearchInput
          label="Buscar eventos"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onClear={() => {
            setText("");
          }}
        />
      );
    }
    render(<Controlled />);
    expect(screen.getByRole("searchbox")).toHaveValue("jazz");
    await userEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("is not required", () => {
    render(<SearchInput label="Buscar eventos" />);
    expect(screen.getByRole("searchbox")).not.toHaveAttribute("aria-required");
    expect(screen.queryByText("(opcional)")).not.toBeInTheDocument();
  });
});
