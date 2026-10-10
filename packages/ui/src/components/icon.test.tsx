import { render } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Icon, ICON_STROKE_WIDTH } from "./icon";

describe("Icon", () => {
  it("draws Lucide icons with the 1.75 stroke of the design system", () => {
    const { container } = render(<Icon icon={Plus} />);
    expect(ICON_STROKE_WIDTH).toBe(1.75);
    expect(container.querySelector("svg")).toHaveAttribute("stroke-width", "1.75");
  });

  it.each([
    [16, "size-4"],
    [20, "size-5"],
    [24, "size-6"],
  ] as const)("supports the %s px size", (size, className) => {
    const { container } = render(<Icon icon={Plus} size={size} />);
    expect(container.querySelector("svg")).toHaveClass(className);
  });

  it("is decorative: hidden from assistive technology and out of the tab order", () => {
    const { container } = render(<Icon icon={Plus} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });
});
