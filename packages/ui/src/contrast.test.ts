import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Recomputes the contrast table of docs/DESIGN.md (section 2.1) from the real token
 * values, using the WCAG 2.2 relative luminance formula.
 */

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--vira-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`Token --vira-${name} not found as a 6-digit hex colour`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Text pairs: 4.5:1 (AA, normal text). */
const TEXT_PAIRS: readonly [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface-sunken"],
  ["ink-muted", "bg"],
  ["ink-muted", "surface"],
  ["ink-muted", "surface-sunken"],
  ["ink-muted", "accent-soft"],
  ["on-accent", "accent"],
  ["on-accent", "accent-hover"],
  ["on-accent", "accent-pressed"],
  ["accent", "surface"],
  ["accent", "bg"],
  ["accent-ink", "accent-soft"],
  ["success", "success-bg"],
  ["warning", "warning-bg"],
  ["danger", "danger-bg"],
  ["danger", "surface"],
  ["info", "info-bg"],
];

/** Non-text pairs (focus ring, field borders): 3:1. */
const NON_TEXT_PAIRS: readonly [string, string][] = [
  ["accent", "bg"],
  ["accent", "surface"],
  ["line-strong", "surface"],
  ["line-strong", "bg"],
];

describe("design tokens meet WCAG 2.2 AA", () => {
  it.each(TEXT_PAIRS)("text: %s on %s is at least 4.5:1", (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("non-text: %s on %s is at least 3:1", (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(3);
  });

  it("documents why accent must not be text on accent-soft", () => {
    // 4.19:1: fails AA for text, so red text on a red tint uses accent-ink.
    expect(contrast(token("accent"), token("accent-soft"))).toBeLessThan(4.5);
    expect(contrast(token("accent-ink"), token("accent-soft"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps ink-subtle for disabled and non-essential content only", () => {
    expect(contrast(token("ink-subtle"), token("surface"))).toBeLessThan(4.5);
  });

  it("keeps decorative lines decorative", () => {
    expect(contrast(token("line"), token("surface"))).toBeLessThan(3);
  });

  it("matches the colours fixed by the design brief", () => {
    expect(token("bg")).toBe("#fafaf8");
    expect(token("ink")).toBe("#0b0b0c");
    expect(token("accent")).toBe("#d92d3a");
    expect(token("accent-ink")).toBe("#b8222e");
  });
});
