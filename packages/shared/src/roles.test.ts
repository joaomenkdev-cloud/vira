import { describe, expect, it } from "vitest";

import { ROLES, roleSatisfies } from "./roles.js";

describe("roleSatisfies", () => {
  it("lets every role act as itself", () => {
    for (const role of ROLES) expect(roleSatisfies(role, role)).toBe(true);
  });

  it("treats roles as cumulative", () => {
    expect(roleSatisfies("ORGANIZER", "BUYER")).toBe(true);
    expect(roleSatisfies("ADMIN", "ORGANIZER")).toBe(true);
    expect(roleSatisfies("ADMIN", "BUYER")).toBe(true);
  });

  it("never lets a lower role act as a higher one", () => {
    expect(roleSatisfies("BUYER", "ORGANIZER")).toBe(false);
    expect(roleSatisfies("BUYER", "ADMIN")).toBe(false);
    expect(roleSatisfies("ORGANIZER", "ADMIN")).toBe(false);
  });
});
