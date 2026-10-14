import { describe, expect, it, vi } from "vitest";

import { once, parseFragmentToken } from "./fragment-token";

const TOKEN = "A".repeat(43);

describe("parseFragmentToken", () => {
  it("reads a well-formed token from the fragment", () => {
    expect(parseFragmentToken(`#token=${TOKEN}`)).toBe(TOKEN);
  });

  it.each(["", "#", "#token=", "#token=curto", `#token=${TOKEN}!`, `#outro=${TOKEN}`])(
    "has no token in %j",
    (hash) => {
      expect(parseFragmentToken(hash)).toBeNull();
    },
  );
});

describe("once", () => {
  it("sends a single-use token a single time", async () => {
    const run = vi.fn(() => Promise.resolve("ok"));

    const [first, second] = await Promise.all([once("k", run), once("k", run)]);

    expect(run).toHaveBeenCalledTimes(1);
    expect(first).toBe("ok");
    expect(second).toBe("ok");
  });
});
