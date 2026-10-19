// A minimal stand-in for the Vira API, used only by the end-to-end tests.
import { createServer } from "node:http";

import { handleCatalog, startStorage } from "./fixtures/catalog.ts";

const port = Number(process.env["PORT"] ?? 3000);
// A second instance answers with an empty storefront (FAKE_CATALOG=empty), for the empty
// states; only the first one also stands in for the object storage.
const empty = process.env["FAKE_CATALOG"] === "empty";
if (!empty) startStorage();

createServer((request, response) => {
  if (handleCatalog(request, response, { empty })) return;
  if (request.url === "/api/v1/health/live") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "x-fake-api": "1",
    });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  response.writeHead(404, { "content-type": "application/problem+json; charset=utf-8" });
  response.end(JSON.stringify({ type: "about:blank", title: "Not found", status: 404 }));
}).listen(port, "127.0.0.1");
