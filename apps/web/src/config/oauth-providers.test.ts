import { describe, expect, it } from "vitest";

import { enabledOAuthProviders } from "./oauth-providers";

describe("enabledOAuthProviders", () => {
  it("offers no social login unless told to", () => {
    expect(enabledOAuthProviders({})).toEqual([]);
    expect(enabledOAuthProviders({ VIRA_OAUTH_PROVIDERS: "" })).toEqual([]);
  });

  it("keeps the known providers, in a fixed order", () => {
    expect(enabledOAuthProviders({ VIRA_OAUTH_PROVIDERS: " GitHub , google " })).toEqual([
      "google",
      "github",
    ]);
    expect(enabledOAuthProviders({ VIRA_OAUTH_PROVIDERS: "github,facebook" })).toEqual(["github"]);
  });
});
