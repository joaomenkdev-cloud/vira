// A minimal stand-in for the Vira API, used only by the end-to-end tests.
import { createServer } from "node:http";

const port = Number(process.env["PORT"] ?? 3000);

createServer((request, response) => {
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
