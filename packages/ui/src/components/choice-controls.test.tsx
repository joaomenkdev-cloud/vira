import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";
import { Radio, RadioGroup } from "./radio-group";

describe("Checkbox", () => {
  it("is a checkbox named by its label", () => {
    render(<Checkbox label="Aceito os termos" />);
    expect(screen.getByRole("checkbox", { name: "Aceito os termos" })).not.toBeChecked();
  });

  it("toggles with a click on the box or on the label", async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Aceito os termos" onCheckedChange={onCheckedChange} />);

    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();

    await userEvent.click(screen.getByText("Aceito os termos"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("toggles with Space and takes focus in the tab order", async () => {
    render(<Checkbox label="Aceito os termos" />);
    await userEvent.tab();
    expect(screen.getByRole("checkbox")).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("is 20 px, with a 44 px row to touch", () => {
    render(<Checkbox label="Aceito os termos" />);
    expect(screen.getByRole("checkbox")).toHaveClass("size-5");
    expect(screen.getByRole("checkbox").parentElement).toHaveClass("min-h-11");
  });

  it("is checked in ink with a tick, not only with colour", () => {
    render(<Checkbox label="Aceito os termos" defaultChecked />);
    const box = screen.getByRole("checkbox");
    expect(box).toHaveClass("data-[state=checked]:bg-ink");
    expect(box.querySelector("svg")).not.toBeNull();
  });

  it("supports the mixed state", () => {
    render(<Checkbox label="Selecionar todos" checked="indeterminate" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
  });

  it("describes itself", () => {
    render(<Checkbox label="Receber novidades" description="No máximo um e-mail por mês." />);
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(
      "No máximo um e-mail por mês.",
    );
  });

  it("reports an error through aria-invalid and aria-describedby", () => {
    render(<Checkbox label="Aceito os termos" error="É preciso aceitar os termos." />);
    const box = screen.getByRole("checkbox");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("É preciso aceitar os termos.");
    expect(box).toHaveClass("border-danger");
  });

  it("is disabled and cannot change", async () => {
    render(<Checkbox label="Aceito os termos" disabled />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});

describe("RadioGroup", () => {
  function Group({ onValueChange }: { onValueChange?: (value: string) => void }) {
    return (
      <RadioGroup
        legend="Forma de entrega"
        defaultValue="email"
        {...(onValueChange ? { onValueChange } : {})}
      >
        <Radio value="email" label="Por e-mail" description="Chega em instantes." />
        <Radio value="app" label="No aplicativo" />
        <Radio value="balcao" label="No balcão" disabled />
      </RadioGroup>
    );
  }

  it("is a radio group named by its legend", () => {
    render(<Group />);
    expect(screen.getByRole("radiogroup", { name: "Forma de entrega" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("checks the default option", () => {
    render(<Group />);
    expect(screen.getByRole("radio", { name: "Por e-mail" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "No aplicativo" })).not.toBeChecked();
  });

  it("selects with a click on the radio or on its label", async () => {
    const onValueChange = vi.fn();
    render(<Group onValueChange={onValueChange} />);
    await userEvent.click(screen.getByText("No aplicativo"));
    expect(screen.getByRole("radio", { name: "No aplicativo" })).toBeChecked();
    expect(onValueChange).toHaveBeenCalledWith("app");
  });

  it("has one tab stop and moves with the arrow keys", async () => {
    render(<Group />);
    await userEvent.tab();
    const first = screen.getByRole("radio", { name: "Por e-mail" });
    expect(first).toHaveFocus();
    expect(screen.getByRole("radio", { name: "No aplicativo" })).toHaveAttribute("tabindex", "-1");

    // Radix selects on focus only while an arrow key is held down, and user-event
    // releases the key at once, so the key down is dispatched on its own.
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = screen.getByRole("radio", { name: "No aplicativo" });
    await waitFor(() => {
      expect(second).toHaveFocus();
      expect(second).toBeChecked();
    });
  });

  it("skips a disabled option", async () => {
    render(<Group />);
    const second = screen.getByRole("radio", { name: "No aplicativo" });
    second.focus();
    fireEvent.keyDown(second, { key: "ArrowDown" });
    // The last option is disabled, so the focus wraps to the first one.
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Por e-mail" })).toHaveFocus();
    });
    expect(screen.getByRole("radio", { name: "No balcão" })).toBeDisabled();
  });

  it("describes an option", () => {
    render(<Group />);
    expect(screen.getByRole("radio", { name: "Por e-mail" })).toHaveAccessibleDescription(
      "Chega em instantes.",
    );
  });

  it("reports an error on the group", () => {
    render(
      <RadioGroup legend="Forma de entrega" error="Escolha uma forma de entrega.">
        <Radio value="email" label="Por e-mail" />
      </RadioGroup>,
    );
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("Escolha uma forma de entrega.");
  });

  it("marks the selected radio with a dot in ink", () => {
    render(<Group />);
    const selected = screen.getByRole("radio", { name: "Por e-mail" });
    expect(selected).toHaveClass("data-[state=checked]:border-ink");
    expect(selected.querySelector("span")).toHaveClass("bg-ink");
  });
});
