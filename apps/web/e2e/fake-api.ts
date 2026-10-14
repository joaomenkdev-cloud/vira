// A stand-in for the Vira API, used only by the end-to-end tests. It keeps accounts,
// sessions and e-mail links in memory and follows the contract in docs/API.md closely
// enough for the web to be exercised in a browser: the same cookies, problem types,
// CSRF rule and strict refresh-token reuse detection.
//
// Test-only routes (never proxied: the web rewrites /api/v1/* only):
//   GET  /__test/mail?to=<email>      last link sent to that address
//   POST /__test/expire-access?email= makes the account's access tokens expire
//   GET  /__test/stats?email=         refreshes and reuse detections of the account
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

interface User {
  id: string;
  name: string;
  email: string;
  password: string | null;
  verified: boolean;
  role: "BUYER" | "ORGANIZER";
  organizer?: { displayName: string; slug: string };
}

interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  spent: Set<string>;
  revoked: boolean;
  authenticatedAt: string;
  lastRefreshedAt: string;
}

type Link =
  | { kind: "verify" | "reset"; email: string }
  | { kind: "email-change"; userId: string; newEmail: string };

type Body = Record<string, unknown>;

/** What every route returns once it has answered. */
type Answered = "answered";

const port = Number(process.env["PORT"] ?? 3000);
const PROBLEM_BASE = "https://github.com/joaomenkdev-cloud/vira/blob/main/docs/API.md#";
/** The password the fake treats as found in a breach (Have I Been Pwned). */
const BREACHED_PASSWORD = "senha-vazada-123";
/** Long enough for two tabs that refresh together to overlap. */
const REFRESH_DELAY_MS = 200;

const ACCESS_COOKIE = "__Host-vira_at";
const REFRESH_COOKIE = "__Secure-vira_rt";
const CSRF_COOKIE = "__Host-vira_csrf";
const REFRESH_PATH = "/api/v1/auth";

/** By e-mail. */
const users = new Map<string, User>();
const links = new Map<string, Link>();
/** The last link sent to each address. */
const mailbox = new Map<string, { kind: string; token: string }>();
/** By id (the family id of the API). */
const sessions = new Map<string, Session>();
const accessTokens = new Map<string, { sessionId: string; expired: boolean }>();
/** By user id. */
const stats = new Map<string, { refreshes: number; reuseDetected: number }>();

const token43 = () => (randomUUID() + randomUUID()).replaceAll("-", "").slice(0, 43);
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function statsOf(userId: string) {
  let entry = stats.get(userId);
  if (!entry) {
    entry = { refreshes: 0, reuseDetected: 0 };
    stats.set(userId, entry);
  }
  return entry;
}

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.verified,
  };
}

function account(user: User) {
  return {
    ...publicUser(user),
    hasPassword: user.password !== null,
    ...(user.organizer ? { organizer: user.organizer } : {}),
  };
}

function sendLink(email: string, link: Link) {
  const token = token43();
  links.set(token, link);
  mailbox.set(email, { kind: link.kind, token });
}

/** A Map, not an object: a cookie named `__proto__` must not reach the prototype. */
function cookiesOf(request: IncomingMessage): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return cookies;
}

function cookie(name: string, value: string, path: string, maxAge: number) {
  return `${name}=${value}; Path=${path}; Max-Age=${String(maxAge)}; HttpOnly; Secure; SameSite=Lax`;
}

function clearedCookies() {
  return [
    cookie(ACCESS_COOKIE, "", "/", 0),
    cookie(REFRESH_COOKIE, "", REFRESH_PATH, 0),
    cookie(CSRF_COOKIE, "", "/", 0),
  ];
}

function issueCookies(session: Session) {
  const access = token43();
  accessTokens.set(access, { sessionId: session.id, expired: false });
  session.refreshToken = token43();
  return [
    cookie(ACCESS_COOKIE, access, "/", 600),
    cookie(REFRESH_COOKIE, session.refreshToken, REFRESH_PATH, 7 * 24 * 3600),
  ];
}

function startSession(user: User, previous: string | undefined) {
  // A new login ends the session whose refresh cookie the browser still had.
  for (const session of sessions.values()) {
    if (session.refreshToken === previous) session.revoked = true;
  }
  const now = new Date().toISOString();
  const session: Session = {
    id: randomUUID(),
    userId: user.id,
    refreshToken: "",
    spent: new Set(),
    revoked: false,
    authenticatedAt: now,
    lastRefreshedAt: now,
  };
  sessions.set(session.id, session);
  return [...issueCookies(session), cookie(CSRF_COOKIE, "", "/", 0)];
}

function userById(id: string): User {
  for (const user of users.values()) if (user.id === id) return user;
  throw new Error(`No user ${id}`);
}

/** The session of the access cookie, if it is valid. */
function authenticate(request: IncomingMessage) {
  const access = accessTokens.get(cookiesOf(request).get(ACCESS_COOKIE) ?? "");
  if (!access || access.expired) return undefined;
  const session = sessions.get(access.sessionId);
  if (!session || session.revoked) return undefined;
  return { session, user: userById(session.userId) };
}

function sessionOfRefreshCookie(request: IncomingMessage) {
  const value = cookiesOf(request).get(REFRESH_COOKIE);
  for (const session of sessions.values()) {
    if (!session.revoked && session.refreshToken === value) return session;
  }
  return undefined;
}

function send(
  response: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string | string[]> = {},
): Answered {
  if (body === undefined) {
    response.writeHead(status, headers);
    response.end();
    return "answered";
  }
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
  return "answered";
}

function problem(
  response: ServerResponse,
  status: number,
  code: string,
  extra: Body = {},
  headers: Record<string, string | string[]> = {},
): Answered {
  return send(
    response,
    status,
    { type: `${PROBLEM_BASE}${code}`, title: code, status, ...extra },
    { ...headers, "content-type": "application/problem+json; charset=utf-8" },
  );
}

async function readBody(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? {} : (JSON.parse(text) as Body);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const emailOf = (value: unknown) => text(value).trim().toLowerCase();

const breached = (response: ServerResponse, path: string) =>
  problem(response, 400, "breached-password", { errors: [{ path, message: "breached" }] });

/** Routes that act with the session: a valid access cookie and the CSRF token. */
function guard(request: IncomingMessage, response: ServerResponse, { csrf }: { csrf: boolean }) {
  const auth = authenticate(request);
  if (!auth) {
    problem(response, 401, "unauthenticated");
    return undefined;
  }
  if (csrf) {
    const header = request.headers["x-csrf-token"];
    const expected = `csrf-${auth.session.id}`;
    if (header !== expected || cookiesOf(request).get(CSRF_COOKIE) !== expected) {
      problem(response, 403, "csrf-failed");
      return undefined;
    }
  }
  return auth;
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<Answered | undefined> {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${String(port)}`);
  const path = url.pathname;
  const method = request.method ?? "GET";

  // Test-only routes.
  if (path === "/__test/mail") {
    const mail = mailbox.get(url.searchParams.get("to") ?? "");
    return mail ? send(response, 200, mail) : send(response, 404, { error: "no mail" });
  }
  if (path === "/__test/expire-access" && method === "POST") {
    const user = users.get(url.searchParams.get("email") ?? "");
    for (const access of accessTokens.values()) {
      if (user && sessions.get(access.sessionId)?.userId === user.id) access.expired = true;
    }
    return send(response, 204);
  }
  if (path === "/__test/stats") {
    const user = users.get(url.searchParams.get("email") ?? "");
    return send(response, 200, user ? statsOf(user.id) : null);
  }

  if (path === "/api/v1/health/live") {
    return send(response, 200, { status: "ok" }, { "x-fake-api": "1" });
  }

  const route = `${method} ${path.replace(/^\/api\/v1/, "")}`;
  const body = method === "GET" || method === "DELETE" ? {} : await readBody(request);

  switch (route) {
    case "POST /auth/register": {
      if (body["password"] === BREACHED_PASSWORD) return breached(response, "password");
      const email = emailOf(body["email"]);
      if (!users.has(email)) {
        users.set(email, {
          id: randomUUID(),
          name: text(body["name"]).trim(),
          email,
          password: text(body["password"]),
          verified: false,
          role: "BUYER",
        });
        sendLink(email, { kind: "verify", email });
      }
      return send(response, 202, { status: "accepted" });
    }

    case "POST /auth/email/verify": {
      const link = links.get(text(body["token"]));
      if (link?.kind !== "verify") return problem(response, 410, "token-expired");
      links.delete(text(body["token"]));
      const user = users.get(link.email);
      if (!user) return problem(response, 410, "token-expired");
      user.verified = true;
      const cookies = startSession(user, cookiesOf(request).get(REFRESH_COOKIE));
      return send(response, 200, { user: publicUser(user) }, { "set-cookie": cookies });
    }

    case "POST /auth/login": {
      const user = users.get(emailOf(body["email"]));
      if (typeof user?.password !== "string" || user.password !== body["password"]) {
        return problem(response, 401, "invalid-credentials");
      }
      if (!user.verified) return problem(response, 403, "email-not-verified");
      const cookies = startSession(user, cookiesOf(request).get(REFRESH_COOKIE));
      return send(response, 200, { user: publicUser(user) }, { "set-cookie": cookies });
    }

    case "POST /auth/refresh": {
      const presented = cookiesOf(request).get(REFRESH_COOKIE) ?? "";
      await sleep(REFRESH_DELAY_MS);
      for (const session of sessions.values()) {
        if (session.revoked) continue;
        if (session.refreshToken === presented) {
          session.spent.add(presented);
          session.lastRefreshedAt = new Date().toISOString();
          statsOf(session.userId).refreshes += 1;
          return send(response, 204, undefined, { "set-cookie": issueCookies(session) });
        }
        if (session.spent.has(presented)) {
          // Strict reuse detection (N4): the whole session goes.
          session.revoked = true;
          statsOf(session.userId).reuseDetected += 1;
          break;
        }
      }
      return problem(response, 401, "unauthenticated", {}, { "set-cookie": clearedCookies() });
    }

    case "GET /auth/csrf": {
      const session = authenticate(request)?.session ?? sessionOfRefreshCookie(request);
      if (!session) return problem(response, 401, "unauthenticated");
      const csrfToken = `csrf-${session.id}`;
      return send(
        response,
        200,
        { csrfToken },
        { "set-cookie": cookie(CSRF_COOKIE, csrfToken, "/", 3600) },
      );
    }

    case "POST /auth/logout": {
      const auth = guard(request, response, { csrf: true });
      if (!auth) return;
      auth.session.revoked = true;
      return send(response, 204, undefined, { "set-cookie": clearedCookies() });
    }

    case "POST /auth/logout-all": {
      const auth = guard(request, response, { csrf: true });
      if (!auth) return;
      for (const session of sessions.values()) {
        if (session.userId === auth.user.id) session.revoked = true;
      }
      return send(response, 204, undefined, { "set-cookie": clearedCookies() });
    }

    case "GET /auth/sessions": {
      const auth = guard(request, response, { csrf: false });
      if (!auth) return;
      const data = [...sessions.values()]
        .filter((session) => session.userId === auth.user.id && !session.revoked)
        .map((session) => ({
          id: session.id,
          authenticatedAt: session.authenticatedAt,
          lastRefreshedAt: session.lastRefreshedAt,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          current: session.id === auth.session.id,
        }));
      return send(response, 200, { data });
    }

    case "POST /auth/password/forgot": {
      const email = emailOf(body["email"]);
      if (users.has(email)) sendLink(email, { kind: "reset", email });
      return send(response, 202, { status: "accepted" });
    }

    case "POST /auth/password/reset": {
      const link = links.get(text(body["token"]));
      if (link?.kind !== "reset") return problem(response, 410, "token-expired");
      if (body["password"] === BREACHED_PASSWORD) return breached(response, "password");
      links.delete(text(body["token"]));
      const user = users.get(link.email);
      if (!user) return problem(response, 410, "token-expired");
      user.password = text(body["password"]);
      user.verified = true;
      for (const session of sessions.values()) {
        if (session.userId === user.id) session.revoked = true;
      }
      return send(response, 204, undefined, { "set-cookie": clearedCookies() });
    }

    case "POST /auth/email/change/confirm": {
      const link = links.get(text(body["token"]));
      if (link?.kind !== "email-change") return problem(response, 410, "token-expired");
      links.delete(text(body["token"]));
      const user = userById(link.userId);
      users.delete(user.email);
      user.email = link.newEmail;
      users.set(user.email, user);
      return send(response, 204);
    }

    case "GET /me": {
      const auth = guard(request, response, { csrf: false });
      if (!auth) return;
      return send(response, 200, { user: account(auth.user) });
    }

    case "PATCH /me": {
      const auth = guard(request, response, { csrf: true });
      if (!auth) return;
      auth.user.name = text(body["name"]).trim();
      return send(response, 200, { user: account(auth.user) });
    }

    case "POST /me/password": {
      const auth = guard(request, response, { csrf: true });
      if (!auth) return;
      if (auth.user.password !== body["currentPassword"]) {
        return problem(response, 400, "incorrect-password");
      }
      if (body["newPassword"] === BREACHED_PASSWORD) return breached(response, "newPassword");
      auth.user.password = text(body["newPassword"]);
      for (const session of sessions.values()) {
        if (session.userId === auth.user.id && session !== auth.session) session.revoked = true;
      }
      return send(response, 204);
    }

    case "POST /me/email": {
      const auth = guard(request, response, { csrf: true });
      if (!auth) return;
      if (auth.user.password !== body["currentPassword"]) {
        return problem(response, 400, "incorrect-password");
      }
      const newEmail = emailOf(body["email"]);
      sendLink(newEmail, { kind: "email-change", userId: auth.user.id, newEmail });
      return send(response, 202, { status: "accepted" });
    }

    case "POST /me/organizer": {
      const auth = guard(request, response, { csrf: true });
      if (!auth) return;
      if (auth.user.organizer) return problem(response, 409, "already-organizer");
      const displayName = text(body["displayName"]).trim();
      const slug = displayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
      auth.user.organizer = { displayName, slug };
      auth.user.role = "ORGANIZER";
      return send(response, 201, { organizerProfile: auth.user.organizer });
    }

    default:
      break;
  }

  const sessionRoute = /^DELETE \/auth\/sessions\/([^/]+)$/.exec(route);
  if (sessionRoute) {
    const auth = guard(request, response, { csrf: true });
    if (!auth) return;
    const session = sessions.get(sessionRoute[1] ?? "");
    if (session?.userId !== auth.user.id || session.revoked) {
      return problem(response, 404, "not-found");
    }
    session.revoked = true;
    return send(response, 204);
  }

  // Social login: GitHub signs a fixed account in, Google says its e-mail is not verified.
  const oauthRoute = /^GET \/auth\/oauth\/(google|github)$/.exec(route);
  if (oauthRoute) {
    if (oauthRoute[1] === "google") {
      return send(response, 302, undefined, { location: "/entrar?erro=oauth-email-not-verified" });
    }
    const email = "social@exemplo.com";
    if (!users.has(email)) {
      users.set(email, {
        id: randomUUID(),
        name: "Conta Social",
        email,
        password: null,
        verified: true,
        role: "BUYER",
      });
    }
    const next = url.searchParams.get("next") ?? "/";
    const user = users.get(email);
    if (!user) return problem(response, 500, "internal-error");
    const cookies = startSession(user, cookiesOf(request).get(REFRESH_COOKIE));
    return send(response, 302, undefined, {
      location: /^\/(?![/\\])/.test(next) ? next : "/",
      "set-cookie": cookies,
    });
  }

  return problem(response, 404, "not-found");
}

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    process.stderr.write(
      `fake API: ${error instanceof Error ? String(error.stack) : String(error)}\n`,
    );
    if (!response.headersSent) problem(response, 500, "internal-error");
  });
}).listen(port, "127.0.0.1");
