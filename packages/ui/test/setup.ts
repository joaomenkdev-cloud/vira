import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom lacks the layout APIs Radix reads when it positions or scrolls floating layers.
const noop = (): void => {
  /* nothing to measure or capture without a layout engine */
};

class ResizeObserverStub {
  observe = noop;
  unobserve = noop;
  disconnect = noop;
}

function polyfill(target: object, name: string, value: unknown): void {
  if (name in target) return;
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
}

polyfill(globalThis, "ResizeObserver", ResizeObserverStub);
polyfill(Element.prototype, "scrollIntoView", noop);
polyfill(Element.prototype, "hasPointerCapture", () => false);
polyfill(Element.prototype, "setPointerCapture", noop);
polyfill(Element.prototype, "releasePointerCapture", noop);
polyfill(window, "matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: noop,
  removeEventListener: noop,
  addListener: noop,
  removeListener: noop,
  dispatchEvent: () => false,
}));
