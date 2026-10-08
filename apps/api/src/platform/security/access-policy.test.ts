import { describe, expect, it } from "vitest";

import { decideAccess } from "./access-policy.js";

const buyer = { id: "u1", role: "BUYER" } as const;
const organizer = { id: "u2", role: "ORGANIZER" } as const;
const admin = { id: "u3", role: "ADMIN" } as const;

describe("decideAccess", () => {
  it("denies routes without a declared policy, even for admins", () => {
    expect(decideAccess(undefined, undefined)).toBe("undeclared");
    expect(decideAccess(undefined, admin)).toBe("undeclared");
  });

  it("allows anyone on public routes", () => {
    expect(decideAccess({ kind: "public" }, undefined)).toBe("allow");
    expect(decideAccess({ kind: "public" }, buyer)).toBe("allow");
  });

  it("requires a session for role-protected routes", () => {
    expect(decideAccess({ kind: "role", role: "BUYER" }, undefined)).toBe("unauthenticated");
  });

  it("allows users holding the role or a higher one", () => {
    expect(decideAccess({ kind: "role", role: "BUYER" }, buyer)).toBe("allow");
    expect(decideAccess({ kind: "role", role: "BUYER" }, organizer)).toBe("allow");
    expect(decideAccess({ kind: "role", role: "ORGANIZER" }, admin)).toBe("allow");
  });

  it("forbids users holding a lower role", () => {
    expect(decideAccess({ kind: "role", role: "ORGANIZER" }, buyer)).toBe("forbidden");
    expect(decideAccess({ kind: "role", role: "ADMIN" }, organizer)).toBe("forbidden");
  });
});
