import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Select } from "./select";

const OPTIONS = [
  { value: "pista", label: "Pista" },
  { value: "camarote", label: "Camarote" },
  { value: "vip", label: "Área VIP", disabled: true },
] as const;

describe("Select", () => {
  it("is a combobox named by its label, with a placeholder", () => {
    render(<Select label="Tipo de ingresso" options={OPTIONS} placeholder="Escolha" />);
    const trigger = screen.getByRole("combobox", { name: "Tipo de ingresso" });
    expect(trigger).toHaveTextContent("Escolha");
    expect(trigger).toHaveAttribute("aria-required", "true");
  });

  it("opens with the mouse, lists the options and selects one", async () => {
    const onValueChange = vi.fn();
    render(<Select label="Tipo" options={OPTIONS} onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Pista" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Camarote" }));

    expect(onValueChange).toHaveBeenCalledWith("camarote");
    expect(screen.getByRole("combobox")).toHaveTextContent("Camarote");
  });

  it("works with the keyboard: open, move, choose and close with Esc", async () => {
    const onValueChange = vi.fn();
    render(<Select label="Tipo" options={OPTIONS} onValueChange={onValueChange} />);

    await userEvent.tab();
    expect(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledOnce();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("marks the chosen option", async () => {
    render(<Select label="Tipo" options={OPTIONS} defaultValue="pista" />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Pista" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Camarote" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("does not let a disabled option be chosen", async () => {
    const onValueChange = vi.fn();
    render(<Select label="Tipo" options={OPTIONS} onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Área VIP" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click(screen.getByRole("option", { name: "Área VIP" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("reports an error through aria-invalid and aria-describedby", () => {
    render(<Select label="Tipo" options={OPTIONS} error="Escolha um tipo de ingresso." />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("Escolha um tipo de ingresso.");
    expect(trigger).toHaveClass("border-danger");
  });

  it("is disabled and cannot be opened", async () => {
    render(<Select label="Tipo" options={OPTIONS} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
