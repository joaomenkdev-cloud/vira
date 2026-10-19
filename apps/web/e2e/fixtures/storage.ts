// Stands in for the private bucket (SeaweedFS locally, R2 in production): a GET answers
// with what a PUT stored at that path, or with the fallback picture; a PUT through a
// pre-signed URL stores the body. The browser sends the PUT from the web origin, so the
// preflight is answered the way `pnpm storage:setup` configures CORS (PUT only).
import { createServer, type IncomingMessage } from "node:http";

export const STORAGE_PORT = 8333;

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

/** By path ("/vira-media/uploads/<id>"). */
export const storedObjects = new Map<string, StoredObject>();

const LOCAL_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/;

async function readAll(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export function startStorage(fallback: (path: string) => Buffer, port = STORAGE_PORT): void {
  createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const origin = request.headers.origin ?? "";
    const cors: Record<string, string> = LOCAL_ORIGIN.test(origin)
      ? { "access-control-allow-origin": origin, vary: "Origin" }
      : {};

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...cors,
        "access-control-allow-methods": "PUT",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      });
      response.end();
      return;
    }

    if (request.method === "PUT") {
      void readAll(request).then((body) => {
        const contentType = request.headers["content-type"] ?? "application/octet-stream";
        storedObjects.set(path, { body, contentType });
        response.writeHead(200, cors);
        response.end();
      });
      return;
    }

    const stored = storedObjects.get(path);
    response.writeHead(200, {
      "content-type": stored?.contentType ?? "image/png",
      "cache-control": "no-store",
    });
    response.end(stored?.body ?? fallback(path));
  }).listen(port, "127.0.0.1");
}
