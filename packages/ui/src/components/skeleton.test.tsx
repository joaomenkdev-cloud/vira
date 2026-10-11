import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton, SkeletonText } from "./skeleton";

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton className="h-6 w-full" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("appears after a delay and pulses, through one animation token", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveClass("animate-skeleton", "bg-surface-sunken");
  });

  it("takes its shape from the caller", () => {
    const { container } = render(<Skeleton className="size-12 rounded-full" />);
    expect(container.firstElementChild).toHaveClass("size-12", "rounded-full");
  });

  it("draws the requested number of text lines, the last one shorter", () => {
    const { container } = render(<SkeletonText lines={4} />);
    const lines = container.querySelectorAll(".animate-skeleton");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toHaveClass("w-2/3");
    expect(lines[0]).toHaveClass("w-full");
  });

  it("keeps a single line at full width", () => {
    const { container } = render(<SkeletonText lines={1} />);
    expect(container.querySelector(".animate-skeleton")).toHaveClass("w-full");
  });
});
