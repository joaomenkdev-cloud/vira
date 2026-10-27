#!/usr/bin/env node
// Post-deploy smoke test (docs/DEPLOY.md, "Smoke test"). Reads only public pages and
// routes: it signs nobody up and buys nothing, so it can run against the live demo.
//
//   WEB_URL=https://vira.example API_URL=https://vira-api.onrender.com node scripts/smoke.mjs

const WEB_URL = origin("WEB_URL");
const API_URL = origin("API_URL");

/** The free Render plan sleeps when idle; the first request wakes it in up to a minute. */
const WAKE_UP_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;

function origin(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} (for example ${name}=https://example.com).`);
    process.exit(2);
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    console.error(`${name} must use https.`);
    process.exit(2);
  }
  return url.origin;
}

const failures = [];
let checks = 0;

async function check(name, run) {
  checks += 1;
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : String(error)}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(url, init = {}) {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
  });
}

async function wakeUp() {
  const deadline = Date.now() + WAKE_UP_MS;
  for (;;) {
    try {
      const response = await get(`${API_URL}/api/v1/health/live`);
      if (response.ok) return;
    } catch {
      // Still waking up.
    }
    if (Date.now() > deadline) throw new Error(`the API did not answer in ${WAKE_UP_MS / 1000} s`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

let firstEvent;

await check("API wakes up and answers /health/live", wakeUp);

await check("API reaches the database and Redis", async () => {
  const response = await get(`${API_URL}/api/v1/health/ready`);
  const body = await response.json();
  expect(response.status === 200, `status ${response.status}: ${JSON.stringify(body)}`);
  expect(
    body.checks?.database === "up" && body.checks?.redis === "up",
    `checks: ${JSON.stringify(body.checks)}`,
  );
});

await check("API keeps the docs closed and its responses out of caches", async () => {
  const docs = await get(`${API_URL}/docs`);
  expect(docs.status === 404, `/docs answered ${docs.status}`);
  const live = await get(`${API_URL}/api/v1/health/live`);
  expect(live.headers.get("cache-control") === "no-store", "no Cache-Control: no-store");
  expect(live.headers.get("x-request-id"), "no X-Request-Id");
  expect(!live.headers.get("x-powered-by"), "X-Powered-By is exposed");
});

await check("home page loads with the security headers", async () => {
  const response = await get(`${WEB_URL}/`);
  expect(response.status === 200, `status ${response.status}`);
  const csp = response.headers.get("content-security-policy") ?? "";
  expect(/script-src [^;]*'nonce-/.test(csp), "CSP without a script nonce");
  expect(csp.includes("frame-ancestors 'none'"), "CSP without frame-ancestors 'none'");
  expect(!/style-src [^;]*'unsafe-inline'/.test(csp), "CSP allows inline styles");
  expect((response.headers.get("strict-transport-security") ?? "").includes("max-age="), "no HSTS");
  expect(response.headers.get("x-frame-options") === "DENY", "no X-Frame-Options: DENY");
});

await check("web forwards /api/v1 to the API and lists the demo events", async () => {
  const response = await get(`${WEB_URL}/api/v1/events?limit=12`);
  expect(response.status === 200, `status ${response.status}`);
  const body = await response.json();
  expect(
    Array.isArray(body.data) && body.data.length > 0,
    "no published event (is the seed applied?)",
  );
  expect(
    body.data.every((event) => event.isDemo),
    "an event without the demo flag is listed",
  );
  firstEvent = body.data[0];
});

await check("event page shows the demo badge", async () => {
  expect(firstEvent, "no event to open");
  const response = await get(`${WEB_URL}/eventos/${firstEvent.slug}`);
  expect(response.status === 200, `status ${response.status}`);
  const html = await response.text();
  expect(html.includes("Demonstração"), "no Demonstração badge");
  expect(html.includes(firstEvent.title.replace(/&/g, "&amp;")), "title missing");
});

await check("event photo comes through the image optimizer", async () => {
  expect(firstEvent, "no event to open");
  const url = `${WEB_URL}/_next/image?url=${encodeURIComponent(firstEvent.image.url)}&w=640&q=75`;
  const response = await get(url);
  expect(response.status === 200, `status ${response.status}`);
  expect(
    (response.headers.get("content-type") ?? "").startsWith("image/"),
    `content-type ${response.headers.get("content-type")}`,
  );
});

await check("anonymous calls to the account are refused", async () => {
  const response = await get(`${WEB_URL}/api/v1/me`);
  expect(response.status === 401, `status ${response.status}`);
  expect(
    (response.headers.get("content-type") ?? "").includes("application/problem+json"),
    "not a problem+json answer",
  );
});

await check("event page says payments are in test mode", async () => {
  const response = await get(`${WEB_URL}/eventos/${firstEvent?.slug ?? ""}`);
  const html = await response.text();
  expect(/modo de teste/i.test(html), "no test-mode notice on the event page");
});

console.log(`\n${checks - failures.length}/${checks} checks passed.`);
if (failures.length > 0) process.exit(1);
