import type { OAuthProviderName } from "@vira/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { type OAuthProfile, pkceChallenge } from "../domain/oauth.js";
import { newUser } from "../domain/user.js";
import { BeginOAuthLogin } from "./begin-oauth-login.js";
import { CompleteOAuthLogin } from "./complete-oauth-login.js";
import { OAuthProviderUnavailableError, ProviderEmailNotVerifiedError } from "./errors.js";
import {
  createRecorders,
  FakeClock,
  FakeIds,
  FakeTransactions,
  InMemoryOAuthAccountRepository,
  InMemoryUserRepository,
} from "./in-memory.fakes.js";
import {
  type AuthorizationRequest,
  type CodeExchange,
  type OAuthProvider,
  OAuthProviderError,
} from "./ports/oauth-provider.js";

const REDIRECT_URI = "http://localhost:3001/api/v1/auth/oauth/google/callback";

/** Hands out whatever profile the test sets; records what it was asked. */
class ScriptedProvider implements OAuthProvider {
  readonly requests: AuthorizationRequest[] = [];
  readonly exchanges: CodeExchange[] = [];
  answer: OAuthProfile | Error = new Error("no profile scripted");

  constructor(readonly name: OAuthProviderName) {}

  authorizationUrl(request: AuthorizationRequest): URL {
    this.requests.push(request);
    return new URL(`https://${this.name}.test/authorize?state=${request.state}`);
  }

  profile(exchange: CodeExchange): Promise<OAuthProfile> {
    this.exchanges.push(exchange);
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

const anaAtGoogle: OAuthProfile = {
  accountId: "google-sub-1",
  email: " Ana@Exemplo.COM ",
  emailVerified: true,
  name: "Ana Souza",
};

function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const accounts = new InMemoryOAuthAccountRepository();
  const google = new ScriptedProvider("google");
  const github = new ScriptedProvider("github");
  const providers = new Map<OAuthProviderName, OAuthProvider>([
    ["google", google],
    ["github", github],
  ]);
  const recorders = createRecorders(clock, ids);
  const begin = new BeginOAuthLogin(providers, clock);
  const complete = new CompleteOAuthLogin(
    providers,
    users,
    accounts,
    new FakeTransactions(),
    clock,
    ids,
    recorders.audit,
  );
  const login = (provider: OAuthProviderName = "google") =>
    complete.execute(
      {
        provider,
        code: "code",
        codeVerifier: "verifier",
        nonce: "nonce",
        redirectUri: REDIRECT_URI,
      },
      { requestId: "req-oauth-1" },
    );
  const actions = () => recorders.auditEntries.map((entry) => entry["action"]);
  return {
    clock,
    ids,
    users,
    accounts,
    google,
    github,
    begin,
    complete,
    login,
    actions,
    ...recorders,
  };
}

describe("BeginOAuthLogin", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("sends the provider the S256 challenge of the verifier, never the verifier", () => {
    const { authorizationUrl, attempt } = s.begin.execute({
      provider: "google",
      redirectUri: REDIRECT_URI,
    });

    expect(s.google.requests).toEqual([
      {
        state: attempt.state,
        codeChallenge: pkceChallenge(attempt.codeVerifier),
        nonce: attempt.nonce,
        redirectUri: REDIRECT_URI,
      },
    ]);
    expect(authorizationUrl.href).not.toContain(attempt.codeVerifier);
  });

  it("keeps a return path only when it is a page of the web app", () => {
    const keep = s.begin.execute({ provider: "google", redirectUri: REDIRECT_URI, returnTo: "/x" });
    const drop = s.begin.execute({
      provider: "google",
      redirectUri: REDIRECT_URI,
      returnTo: "//evil.example/x",
    });
    expect(keep.attempt.returnTo).toBe("/x");
    expect(drop.attempt.returnTo).toBeNull();
  });

  it("refuses a provider without credentials", () => {
    const begin = new BeginOAuthLogin(new Map(), s.clock);
    expect(() => begin.execute({ provider: "github", redirectUri: REDIRECT_URI })).toThrow(
      OAuthProviderUnavailableError,
    );
  });
});

describe("CompleteOAuthLogin", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.google.answer = anaAtGoogle;
  });

  describe("for an e-mail without an account", () => {
    it("opens a verified BUYER account without a password, linked to the provider", async () => {
      const user = await s.login();

      expect(user).toMatchObject({
        name: "Ana Souza",
        email: "ana@exemplo.com",
        role: "BUYER",
        emailVerified: true,
      });
      expect(s.users.get(user.id)).toMatchObject({
        passwordHash: null,
        emailVerifiedAt: s.clock.current,
      });
      expect(s.accounts.accounts).toEqual([
        expect.objectContaining({
          userId: user.id,
          provider: "google",
          providerAccountId: "google-sub-1",
        }),
      ]);
    });

    it("hands the provider the secrets of the attempt", async () => {
      await s.login();
      expect(s.google.exchanges).toEqual([
        { code: "code", codeVerifier: "verifier", nonce: "nonce", redirectUri: REDIRECT_URI },
      ]);
    });

    it("is audited: registered, linked and logged in, without personal data", async () => {
      const user = await s.login();

      expect(s.actions()).toEqual(["auth.registered", "auth.oauth_linked", "auth.login_succeeded"]);
      expect(s.auditEntries).toContainEqual(
        expect.objectContaining({
          action: "auth.oauth_linked",
          actorId: user.id,
          requestId: "req-oauth-1",
          metadata: { provider: "google", tookOverUnverified: false },
        }),
      );
      expect(s.auditEntries.at(-1)).toMatchObject({ metadata: { method: "google" } });
      const recorded = JSON.stringify(s.auditEntries);
      expect(recorded).not.toContain("exemplo.com");
      expect(recorded).not.toContain("google-sub-1");
    });

    it("names the account after the e-mail when the provider has no name", async () => {
      s.google.answer = { ...anaAtGoogle, name: "" };
      expect((await s.login()).name).toBe("ana");
    });
  });

  describe("for a provider account linked before", () => {
    it("logs in to the same account, even after the e-mail changed at the provider", async () => {
      const first = await s.login();
      s.google.answer = { ...anaAtGoogle, email: "ana.nova@exemplo.com" };

      const second = await s.login();

      expect(second.id).toBe(first.id);
      expect(second.email).toBe("ana@exemplo.com");
      expect(s.users.users.size).toBe(1);
      expect(s.accounts.accounts).toHaveLength(1);
    });

    it("does not even need a verified e-mail any more", async () => {
      const first = await s.login();
      s.google.answer = { ...anaAtGoogle, emailVerified: false, email: null };
      expect((await s.login()).id).toBe(first.id);
    });
  });

  describe("for an e-mail that already has an account", () => {
    function existing(verified: boolean) {
      const user = newUser({
        id: s.ids.next(),
        name: "Ana",
        email: "ana@exemplo.com",
        passwordHash: "$argon2id$fake$hers",
        now: s.clock.current,
      });
      s.users.users.set(user.id, { ...user, emailVerifiedAt: verified ? s.clock.current : null });
      return user;
    }

    it("links a verified account and keeps its password", async () => {
      const ana = existing(true);

      const user = await s.login();

      expect(user.id).toBe(ana.id);
      expect(s.users.get(ana.id).passwordHash).toBe("$argon2id$fake$hers");
      expect(s.actions()).toEqual(["auth.oauth_linked", "auth.login_succeeded"]);
    });

    it("takes over an account nobody verified: verified now, and the registrant's password is gone", async () => {
      // Someone registered Ana's address before she did (pre-account takeover).
      const squatted = existing(false);
      s.users.users.set(squatted.id, {
        ...s.users.get(squatted.id),
        failedLoginCount: 3,
        lockedUntil: new Date(s.clock.current.getTime() + 60_000),
      });

      const user = await s.login();

      expect(user).toMatchObject({ id: squatted.id, emailVerified: true });
      expect(s.users.get(squatted.id)).toMatchObject({
        passwordHash: null,
        emailVerifiedAt: s.clock.current,
        failedLoginCount: 0,
        lockedUntil: null,
      });
      expect(s.actions()).toEqual([
        "auth.email_verified",
        "auth.oauth_linked",
        "auth.login_succeeded",
      ]);
      expect(s.auditEntries).toContainEqual(
        expect.objectContaining({ metadata: { provider: "google", tookOverUnverified: true } }),
      );
    });

    it("links a second provider to the same account", async () => {
      const viaGoogle = await s.login("google");
      s.github.answer = {
        accountId: "4242",
        email: "ana@exemplo.com",
        emailVerified: true,
        name: "ana",
      };

      const viaGitHub = await s.login("github");

      expect(viaGitHub.id).toBe(viaGoogle.id);
      expect(s.accounts.accounts.map((a) => a.provider)).toEqual(["google", "github"]);
    });
  });

  describe("when the provider does not vouch for the e-mail", () => {
    it.each([
      ["unverified", { emailVerified: false }],
      ["missing", { email: null, emailVerified: true }],
      ["not an address", { email: "ana at exemplo", emailVerified: true }],
    ])("refuses an e-mail that is %s and writes nothing", async (_, change) => {
      s.google.answer = { ...anaAtGoogle, ...change };

      await expect(s.login()).rejects.toThrow(ProviderEmailNotVerifiedError);

      expect(s.users.users.size).toBe(0);
      expect(s.accounts.accounts).toHaveLength(0);
      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.login_failed",
          actorId: null,
          metadata: { reason: "provider_email_not_verified" },
        }),
      ]);
    });

    it("never matches it to an existing account either", async () => {
      const victim = newUser({
        id: s.ids.next(),
        name: "Ana",
        email: "ana@exemplo.com",
        passwordHash: "$argon2id$fake$hers",
        now: s.clock.current,
      });
      s.users.users.set(victim.id, { ...victim, emailVerifiedAt: s.clock.current });
      s.google.answer = { ...anaAtGoogle, accountId: "attacker", emailVerified: false };

      await expect(s.login()).rejects.toThrow(ProviderEmailNotVerifiedError);
      expect(s.accounts.accounts).toHaveLength(0);
    });
  });

  it("passes on the provider's refusal and writes nothing", async () => {
    s.google.answer = new OAuthProviderError("invalid_grant");

    await expect(s.login()).rejects.toThrow(OAuthProviderError);
    expect(s.users.users.size).toBe(0);
    expect(s.auditEntries).toEqual([]);
  });

  it("refuses a provider without credentials", async () => {
    const complete = new CompleteOAuthLogin(
      new Map(),
      s.users,
      s.accounts,
      new FakeTransactions(),
      s.clock,
      s.ids,
      s.audit,
    );
    await expect(
      complete.execute({
        provider: "google",
        code: "c",
        codeVerifier: "v",
        nonce: "n",
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow(OAuthProviderUnavailableError);
  });

  describe("racing a concurrent login of the same provider account", () => {
    it("logs in to the account the other request created, and creates no second one", async () => {
      // The other request links the provider account between our lookup and our insert.
      let otherUserId = "";
      s.accounts.beforeLink = () => {
        const other = newUser({
          id: s.ids.next(),
          name: "Ana",
          email: "ana.outra@exemplo.com",
          passwordHash: "$argon2id$fake$x",
          now: s.clock.current,
        });
        otherUserId = other.id;
        s.users.users.set(other.id, other);
        s.accounts.accounts.push({
          id: s.ids.next(),
          userId: other.id,
          provider: "google",
          providerAccountId: "google-sub-1",
          createdAt: s.clock.current,
        });
      };

      const user = await s.login();

      expect(user.id).toBe(otherUserId);
      // Our account and its link were rolled back together.
      expect([...s.users.users.values()].map((u) => u.email)).toEqual(["ana.outra@exemplo.com"]);
      expect(s.accounts.accounts).toHaveLength(1);
      expect(s.actions()).toEqual(["auth.login_succeeded"]);
    });
  });
});
