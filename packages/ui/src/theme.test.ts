import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Keeps theme.css and tokens.css in step: no dangling reference, no orphan colour. */

const tokens = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
const theme = readFileSync(join(import.meta.dirname, "theme.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const defined = new Set([...tokens.matchAll(/(--vira-[\w-]+):/g)].map((m) => m[1]));
const referenced = new Set([...theme.matchAll(/var\((--vira-[\w-]+)\)/g)].map((m) => m[1]));

describe("theme.css", () => {
  it("only references tokens that exist", () => {
    expect([...referenced].filter((name) => !defined.has(name))).toEqual([]);
  });

  it("exposes every token to Tailwind or to a utility", () => {
    expect([...defined].filter((name) => name && !referenced.has(name))).toEqual([]);
  });

  it("holds no literal colour: colours live in tokens.css only", () => {
    expect(theme.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull();
  });
});
