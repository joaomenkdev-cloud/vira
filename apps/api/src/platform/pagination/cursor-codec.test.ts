import { describe, expect, it } from "vitest";

import type { AppConfig } from "../config/config.schema.js";
import { CursorCodec } from "./cursor-codec.js";

const codecWith = (csrfSecret: string) =>
  new CursorCodec({ auth: { csrfSecret } } as unknown as AppConfig);
const codec = codecWith("a".repeat(43));
const position = { key: "2026-10-17T12:00:00.000Z", id: "0192a0e4-0000-7000-8000-000000000001" };

describe("CursorCodec", () => {
  it("round-trips a position within its scope", () => {
    expect(codec.decode("list:a", codec.encode("list:a", position))).toEqual(position);
  });

  it("refuses a cursor from another scope (another organizer, another filter)", () => {
    expect(codec.decode("list:b", codec.encode("list:a", position))).toBeNull();
  });

  it("refuses an edited position", () => {
    const [, mac] = codec.encode("list:a", position).split(".");
    const forged = Buffer.from(JSON.stringify([position.key, "someone-else"])).toString(
      "base64url",
    );
    expect(codec.decode("list:a", `${forged}.${mac}`)).toBeNull();
  });

  it("refuses a cursor signed with another key", () => {
    expect(codec.decode("list:a", codecWith("b".repeat(43)).encode("list:a", position))).toBeNull();
  });

  it.each(["", ".", "abc", "abc.def", "a.b.c", "😀.😀"])("refuses garbage %j", (cursor) => {
    expect(codec.decode("list:a", cursor)).toBeNull();
  });
});
