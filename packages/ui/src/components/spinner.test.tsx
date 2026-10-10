import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("is a status with a text alternative", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando");
  });

  it("accepts another label", () => {
    render(<Spinner label="Confirmando pagamento" />);
    expect(screen.getByRole("status")).toHaveTextContent("Confirmando pagamento");
  });

  it("spins", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("draws only the icon when decorative", () => {
    const { container } = render(<Spinner decorative />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
