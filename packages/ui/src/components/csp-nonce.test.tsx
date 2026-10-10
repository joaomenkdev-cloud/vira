import { render } from "@testing-library/react";
import { getNonce } from "get-nonce";
import { describe, expect, it } from "vitest";

import { CspNonce } from "./csp-nonce";

describe("CspNonce", () => {
  it("hands the nonce to the libraries that inject a style element", () => {
    render(<CspNonce nonce="abc123" />);
    expect(getNonce()).toBe("abc123");
  });

  it("renders nothing", () => {
    const { container } = render(<CspNonce nonce="abc123" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("follows a new nonce", () => {
    const { rerender } = render(<CspNonce nonce="first" />);
    rerender(<CspNonce nonce="second" />);
    expect(getNonce()).toBe("second");
  });
});
