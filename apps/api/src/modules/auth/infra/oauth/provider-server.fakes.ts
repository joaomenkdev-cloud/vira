import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** One request the fake provider received. */
export interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingMessage["headers"];
  /** Form fields of an `application/x-www-form-urlencoded` body. */
  readonly form: Record<string, string>;
}

export interface CannedResponse {
  readonly status?: number;
  readonly body: unknown;
}

type Route = (request: ReceivedRequest) => CannedResponse;

/**
 * A real HTTP server on localhost standing in for a provider's endpoints, so the
 * adapters are tested over the wire (fetch, headers, form bodies, status codes).
 */
export class FakeProviderServer {
  readonly received: ReceivedRequest[] = [];
  private readonly routes = new Map<string, Route>();
  private server: Server | undefined;
  private baseUrl = "";

  async start(): Promise<void> {
    this.server = createServer((incoming, outgoing) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const path = new URL(incoming.url ?? "/", "http://localhost").pathname;
        const request: ReceivedRequest = {
          method: incoming.method ?? "GET",
          path,
          headers: incoming.headers,
          form: Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))),
        };
        this.received.push(request);
        const route = this.routes.get(`${request.method} ${path}`);
        const answer = route ? route(request) : { status: 404, body: { error: "not_found" } };
        const body = typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
        outgoing.writeHead(answer.status ?? 200, { "Content-Type": "application/json" });
        outgoing.end(body);
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server)
        this.server.close(() => {
          resolve();
        });
      else resolve();
    });
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  on(method: string, path: string, route: Route): void {
    this.routes.set(`${method} ${path}`, route);
  }

  requestsTo(path: string): ReceivedRequest[] {
    return this.received.filter((request) => request.path === path);
  }
}
