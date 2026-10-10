import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { QuantityStepper } from "./quantity-stepper";

const decrease = () => screen.getByRole("button", { name: "Diminuir quantidade" });
const increase = () => screen.getByRole("button", { name: "Aumentar quantidade" });

describe("QuantityStepper", () => {
  it("is a group named by what it counts", () => {
    render(<QuantityStepper label="Pista – Lote 1" defaultValue={2} />);
    expect(screen.getByRole("group", { name: "Pista – Lote 1" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2");
  });

  it("steps up and down", async () => {
    const onValueChange = vi.fn();
    render(
      <QuantityStepper label="Pista" defaultValue={1} max={4} onValueChange={onValueChange} />,
    );

    await userEvent.click(increase());
    await userEvent.click(increase());
    expect(screen.getByRole("status")).toHaveTextContent("3");
    await userEvent.click(decrease());
    expect(screen.getByRole("status")).toHaveTextContent("2");
    expect(onValueChange.mock.calls).toEqual([[2], [3], [2]]);
  });

  it("announces the value politely, as a whole", () => {
    render(<QuantityStepper label="Pista" defaultValue={1} />);
    const value = screen.getByRole("status");
    expect(value).toHaveAttribute("aria-live", "polite");
    expect(value).toHaveAttribute("aria-atomic", "true");
  });

  it("shows the new value in the live region after each change", async () => {
    render(<QuantityStepper label="Pista" />);
    await userEvent.click(increase());
    expect(screen.getByRole("status")).toHaveTextContent("1");
  });

  it("disables the decrease button at the minimum and stops there", async () => {
    render(<QuantityStepper label="Pista" defaultValue={0} min={0} max={3} />);
    expect(decrease()).toHaveAttribute("aria-disabled", "true");
    expect(increase()).not.toHaveAttribute("aria-disabled");
    await userEvent.click(decrease());
    expect(screen.getByRole("status")).toHaveTextContent("0");
  });

  it("disables the increase button at the maximum and stops there", async () => {
    render(<QuantityStepper label="Pista" defaultValue={3} min={0} max={3} />);
    expect(increase()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(increase());
    expect(screen.getByRole("status")).toHaveTextContent("3");
  });

  it("keeps keyboard focus on the button that just reached its limit", async () => {
    render(<QuantityStepper label="Pista" defaultValue={2} max={3} />);
    increase().focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("3");
    expect(increase()).toHaveFocus();
    expect(increase()).toHaveAttribute("aria-disabled", "true");
  });

  it("respects the step", async () => {
    render(<QuantityStepper label="Pista" defaultValue={0} step={2} max={5} />);
    await userEvent.click(increase());
    await userEvent.click(increase());
    await userEvent.click(increase());
    expect(screen.getByRole("status")).toHaveTextContent("5");
  });

  it("is operable with the keyboard", async () => {
    render(<QuantityStepper label="Pista" defaultValue={1} />);
    await userEvent.tab();
    expect(decrease()).toHaveFocus();
    await userEvent.tab();
    expect(increase()).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("status")).toHaveTextContent("2");
  });

  it("works controlled", async () => {
    function Controlled() {
      const [quantity, setQuantity] = useState(1);
      return <QuantityStepper label="Pista" value={quantity} onValueChange={setQuantity} />;
    }
    render(<Controlled />);
    await userEvent.click(increase());
    expect(screen.getByRole("status")).toHaveTextContent("2");
  });

  it("makes both buttons 44 px round targets", () => {
    render(<QuantityStepper label="Pista" />);
    for (const button of [decrease(), increase()]) {
      expect(button).toHaveClass("size-11", "rounded-full");
    }
  });

  it("does nothing when disabled", async () => {
    render(<QuantityStepper label="Pista" defaultValue={1} disabled />);
    expect(decrease()).toBeDisabled();
    expect(increase()).toBeDisabled();
    await userEvent.click(increase());
    expect(screen.getByRole("status")).toHaveTextContent("1");
  });

  it("submits its value with a form", () => {
    const { container } = render(
      <QuantityStepper label="Pista" name="quantity" defaultValue={2} />,
    );
    expect(container.querySelector('input[type="hidden"][name="quantity"]')).toHaveValue("2");
  });
});
