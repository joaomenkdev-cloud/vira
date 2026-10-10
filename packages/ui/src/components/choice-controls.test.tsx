import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";
import { Radio, RadioGroup } from "./radio-group";

describe("Checkbox", () => {
  it("is a checkbox named by its label", () => {
    render(<Checkbox label="Aceito os termos" />);
    expect(screen.getByRole("checkbox", { name: "Aceito os termos" })).not.toBeChecked();
  });

  it("toggles with a click on the box or on the label", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Aceito os termos" onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();

    await userEvent.click(screen.getByText("Aceito os termos"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
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
    expect(screen.getByRole("checkbox").closest("div")).toHaveClass("min-h-11");
  });

  it("is checked in ink with a tick, not only with colour", () => {
    render(<Checkbox label="Aceito os termos" defaultChecked />);
    const box = screen.getByRole("checkbox");
    expect(box).toHaveClass("checked:bg-ink", "checked:border-ink");
    expect(box.parentElement?.querySelectorAll("svg")).toHaveLength(2);
  });

  it("supports the mixed state", () => {
    render(<Checkbox label="Selecionar todos" indeterminate />);
    const box = screen.getByRole("checkbox");
    expect(box).toBePartiallyChecked();
    expect(box).toHaveClass("indeterminate:bg-ink");
  });

  it("leaves the mixed state when it stops being mixed", () => {
    const { rerender } = render(<Checkbox label="Selecionar todos" indeterminate />);
    rerender(<Checkbox label="Selecionar todos" />);
    expect(screen.getByRole("checkbox")).not.toBePartiallyChecked();
  });

  it("describes itself, keeping the description out of its name", () => {
    render(<Checkbox label="Receber novidades" description="No máximo um e-mail por mês." />);
    const box = screen.getByRole("checkbox", { name: "Receber novidades" });
    expect(box).toHaveAccessibleDescription("No máximo um e-mail por mês.");
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

  it("submits with a form", () => {
    render(
      <form aria-label="formulário">
        <Checkbox label="Aceito" name="terms" defaultChecked />
      </form>,
    );
    const form = screen.getByRole<HTMLFormElement>("form");
    expect(new FormData(form).get("terms")).toBe("on");
  });

  it("puts no inline style in the server HTML, which the strict CSP would block", () => {
    expect(renderToString(<Checkbox label="Aceito" />)).not.toMatch(/\sstyle=/);
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
    expect(screen.getByRole("radio", { name: "Por e-mail" })).not.toBeChecked();
    expect(onValueChange).toHaveBeenCalledWith("app");
  });

  it("has one tab stop and moves with the arrow keys", async () => {
    render(
      <>
        <RadioGroup legend="Forma de entrega" defaultValue="email">
          <Radio value="email" label="Por e-mail" />
          <Radio value="app" label="No aplicativo" />
        </RadioGroup>
        <button type="button">Depois</button>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Por e-mail" })).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "No aplicativo" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "No aplicativo" })).toBeChecked();

    // The whole group is one stop: the next Tab leaves it.
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Depois" })).toHaveFocus();
  });

  it("never selects a disabled option", async () => {
    render(<Group />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("radio", { name: "No balcão" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "No balcão" })).not.toBeChecked();
  });

  it("shares one name so the form receives the choice", async () => {
    render(
      <form aria-label="formulário">
        <RadioGroup legend="Forma de entrega" name="delivery" defaultValue="email">
          <Radio value="email" label="Por e-mail" />
          <Radio value="app" label="No aplicativo" />
        </RadioGroup>
      </form>,
    );
    await userEvent.click(screen.getByRole("radio", { name: "No aplicativo" }));
    const form = screen.getByRole<HTMLFormElement>("form");
    expect(new FormData(form).get("delivery")).toBe("app");
  });

  it("describes an option, keeping the description out of its name", () => {
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
    expect(screen.getByRole("radio")).toHaveClass("border-danger");
  });

  it("disables every option with the group", () => {
    render(
      <RadioGroup legend="Forma de entrega" disabled>
        <Radio value="email" label="Por e-mail" />
        <Radio value="app" label="No aplicativo" />
      </RadioGroup>,
    );
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });

  it("marks the selected radio with a dot in ink", () => {
    render(<Group />);
    const selected = screen.getByRole("radio", { name: "Por e-mail" });
    expect(selected).toHaveClass("checked:border-ink");
    expect(selected.nextElementSibling).toHaveClass("bg-ink", "peer-checked:block");
  });

  it("works controlled", () => {
    const options = (
      <>
        <Radio value="email" label="Por e-mail" />
        <Radio value="app" label="No aplicativo" />
      </>
    );
    const { rerender } = render(
      <RadioGroup legend="Entrega" value="app" onValueChange={() => undefined}>
        {options}
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "No aplicativo" })).toBeChecked();
    rerender(
      <RadioGroup legend="Entrega" value="email" onValueChange={() => undefined}>
        {options}
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "Por e-mail" })).toBeChecked();
  });

  it("refuses a Radio outside a group", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Radio value="a" label="A" />)).toThrow(/RadioGroup/);
    error.mockRestore();
  });

  it("puts no inline style in the server HTML, which the strict CSP would block", () => {
    const html = renderToString(
      <RadioGroup legend="Entrega" defaultValue="email">
        <Radio value="email" label="Por e-mail" />
      </RadioGroup>,
    );
    expect(html).not.toMatch(/\sstyle=/);
  });
});
