// Storefront answers of the stand-in API (GET /api/v1/events…), shaped exactly like the
// contracts in @vira/shared (they are strict: an extra field fails the page). Every event
// here is a test fixture and is marked "Demonstração", except one that checks the badge
// stays away from the others.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CatalogEventDetail, CatalogEventSummary, PublicTicketType } from "@vira/shared";

import { encodePng, type Rgb } from "./png.ts";

export const STORAGE_PORT = 8333;
const STORAGE = `http://127.0.0.1:${STORAGE_PORT}`;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const PALETTES: readonly (readonly [Rgb, Rgb])[] = [
  [
    [217, 45, 58],
    [242, 242, 239],
  ],
  [
    [11, 11, 12],
    [138, 141, 148],
  ],
  [
    [20, 108, 67],
    [232, 245, 238],
  ],
  [
    [138, 90, 0],
    [255, 244, 224],
  ],
];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const brl = (amountCents: number) => ({ amountCents, currency: "BRL" as const });
const iso = (time: number) => new Date(time).toISOString();
const RED_ON_WHITE: readonly [Rgb, Rgb] = [
  [217, 45, 58],
  [242, 242, 239],
];
const palette = (n: number) => PALETTES[n % PALETTES.length] ?? RED_ON_WHITE;
const blur = (n: number) =>
  `data:image/png;base64,${encodePng(16, 10, palette(n)).toString("base64")}`;

/** Saturday 00:00 of the coming weekend, Brasília time (mirrors src/lib/catalog/search.ts). */
function saturday(now: number): number {
  const local = new Date(now - 3 * HOUR);
  const weekday = local.getUTCDay();
  const days = weekday === 0 ? -1 : 6 - weekday;
  const day = new Date(local.getTime() + days * DAY).toISOString().slice(0, 10);
  return Date.parse(`${day}T00:00:00-03:00`);
}

interface TicketOptions {
  available?: number;
  status?: PublicTicketType["salesStatus"];
  description?: string;
  salesStartAt?: string;
}

function ticket(
  n: number,
  name: string,
  priceCents: number,
  { available = 100, status = "ON_SALE", ...rest }: TicketOptions = {},
): PublicTicketType {
  return {
    id: uuid(1000 + n),
    name,
    description: rest.description ?? null,
    price: brl(priceCents),
    maxPerOrder: 6,
    available,
    salesStartAt: rest.salesStartAt ?? null,
    salesEndAt: null,
    salesStatus: status,
  };
}

const LONG_DESCRIPTION = [
  "<p>Uma noite inteira de forró pé de serra, com trio de sanfona, zabumba e triângulo.</p>",
  "<h3>Programação</h3>",
  "<ul><li>20:00 · Abertura dos portões</li><li>21:00 · Trio Asa Branca</li><li>23:00 · Baile até o fim</li></ul>",
  "<p>Leve roupa leve e sapato confortável: o salão é grande e a pista não para.</p>",
  '<p>Mais informações no <a href="https://example.com/forro" rel="noopener noreferrer">site do organizador</a>.</p>',
  "<p>Classificação: 16 anos. Menores acompanhados dos pais ou responsáveis.</p>",
].join("\n");

/** An event as the fake keeps it: the page's fields, the credit beside the photo. */
interface FakeEvent extends Omit<CatalogEventDetail, "image" | "priceFrom" | "soldOut"> {
  image: CatalogEventSummary["image"];
  credit: CatalogEventDetail["image"]["credit"];
}

type EventFields = Omit<
  FakeEvent,
  "id" | "status" | "timezone" | "isDemo" | "descriptionHtml" | "organizer" | "credit" | "image"
> &
  Partial<Pick<FakeEvent, "status" | "isDemo" | "descriptionHtml" | "credit">>;

/** `hour`:00 in Brasília, `days` days from now: round times, as real events have. */
function at(now: number, days: number, hour: number): number {
  const day = new Date(now - 3 * HOUR + days * DAY).toISOString().slice(0, 10);
  return Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00-03:00`);
}

function buildEvents(now: number): { events: FakeEvent[]; all: FakeEvent[] } {
  const later = now + 7 * DAY;
  const thisWeekend = saturday(now);
  // Saturday night of this weekend; on a Sunday, when it has passed, Sunday night.
  const jazz =
    thisWeekend + 21 * HOUR > now ? thisWeekend + 21 * HOUR : thisWeekend + DAY + 22 * HOUR;
  const base = (n: number, fields: EventFields): FakeEvent => ({
    id: uuid(n),
    status: "PUBLISHED",
    timezone: "America/Sao_Paulo",
    isDemo: true,
    descriptionHtml: "<p>Evento de teste dos testes de ponta a ponta.</p>",
    organizer: { name: "Organização de Teste" },
    credit: null,
    ...fields,
    image: {
      url: `${STORAGE}/vira-events/events/${uuid(n)}/photo.webp?X-Amz-Signature=fake${n}`,
      alt: `Foto do evento ${fields.title}`,
      width: 1800,
      height: 1200,
      blurDataUrl: blur(n),
    },
  });

  const events = [
    base(1, {
      slug: "forro-na-praca",
      title: "Forró na Praça",
      startsAt: iso(at(now, 3, 21)),
      endsAt: iso(at(now, 3, 21) + 5 * HOUR),
      venue: { name: "Casa de Shows", address: "Rua da Aurora, 100", city: "Recife", state: "PE" },
      descriptionHtml: LONG_DESCRIPTION,
      credit: {
        author: "Autora da Foto",
        url: "https://unsplash.com/",
        license: "Licença Unsplash",
      },
      ticketTypes: [
        ticket(1, "Pista", 8000, { description: "Acesso à pista" }),
        ticket(2, "Camarote", 20000, { available: 4 }),
        ticket(3, "Meia-entrada", 4000, { available: 0, status: "SOLD_OUT" }),
      ],
    }),
    base(2, {
      slug: "jazz-no-teatro",
      title: "Noite de Jazz no Teatro Municipal",
      startsAt: iso(jazz),
      endsAt: iso(jazz + 2 * HOUR),
      venue: {
        name: "Teatro Municipal",
        address: "Praça Ramos, s/n",
        city: "São Paulo",
        state: "SP",
      },
      ticketTypes: [ticket(4, "Plateia", 12000), ticket(5, "Balcão", 6000)],
    }),
    base(3, {
      slug: "sarau-esgotado",
      title: "Sarau de Poesia",
      startsAt: iso(at(now, 5, 19)),
      endsAt: iso(at(now, 5, 19) + 3 * HOUR),
      venue: {
        name: "Livraria Central",
        address: "Av. Afonso Pena, 1500",
        city: "Belo Horizonte",
        state: "MG",
      },
      ticketTypes: [ticket(6, "Entrada", 3000, { available: 0, status: "SOLD_OUT" })],
    }),
    base(4, {
      slug: "festival-de-cinema",
      title: "Festival de Cinema Independente",
      isDemo: false,
      startsAt: iso(at(later, 9, 14)),
      endsAt: iso(at(later, 11, 22)),
      venue: {
        name: "Cine Capitólio",
        address: "Rua Demétrio Ribeiro, 1085",
        city: "Porto Alegre",
        state: "RS",
      },
      ticketTypes: [
        ticket(7, "Passaporte", 15000, {
          status: "NOT_STARTED",
          salesStartAt: iso(at(later, 2, 12)),
        }),
      ],
    }),
    ...Array.from({ length: 11 }, (_, index) =>
      base(10 + index, {
        slug: `feira-de-livros-${index + 1}`,
        title: `Feira de Livros ${index + 1}`,
        startsAt: iso(at(later, 14 + index, 10)),
        endsAt: iso(at(later, 14 + index, 18)),
        venue: {
          name: "Centro de Convenções",
          address: "Av. Principal, 1",
          city: "Curitiba",
          state: "PR",
        },
        ticketTypes: [ticket(20 + index, "Entrada", 2000)],
      }),
    ),
  ];
  // Only the event page shows these two; the lists never do.
  const hidden = [
    base(90, {
      slug: "show-cancelado",
      title: "Show Cancelado",
      status: "CANCELED",
      startsAt: iso(at(now, 4, 20)),
      endsAt: iso(at(now, 4, 22)),
      venue: { name: "Arena", address: "Rua A, 10", city: "Salvador", state: "BA" },
      ticketTypes: [ticket(90, "Pista", 9000)],
    }),
    base(91, {
      slug: "evento-encerrado",
      title: "Bloco de Ontem",
      startsAt: iso(at(now, -2, 14)),
      endsAt: iso(at(now, -2, 18)),
      venue: { name: "Rua do Bloco", address: "Rua B, 20", city: "Olinda", state: "PE" },
      ticketTypes: [ticket(91, "Abadá", 5000, { status: "CLOSED" })],
    }),
  ];
  return { events, all: [...events, ...hidden] };
}

function onSale(event: FakeEvent): PublicTicketType[] {
  return event.ticketTypes.filter((t) => t.available > 0 && t.salesStatus !== "CLOSED");
}

function summary(event: FakeEvent): CatalogEventSummary {
  const left = onSale(event);
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    isDemo: event.isDemo,
    priceFrom: left.length ? brl(Math.min(...left.map((t) => t.price.amountCents))) : null,
    soldOut: left.length === 0,
    venue: { name: event.venue.name, city: event.venue.city, state: event.venue.state },
    image: event.image,
  };
}

function detail(event: FakeEvent): CatalogEventDetail {
  const { venue: _venue, image: _image, ...common } = summary(event);
  return {
    ...common,
    descriptionHtml: event.descriptionHtml,
    venue: event.venue,
    image: { ...event.image, credit: event.credit },
    organizer: event.organizer,
    ticketTypes: event.ticketTypes,
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const problem = (status: number, title: string) => ({ type: "about:blank", title, status });

/** Answers a storefront request; returns false for any other path. */
export function handleCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  { empty = false }: { empty?: boolean } = {},
): boolean {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET" || !url.pathname.startsWith("/api/v1/events")) return false;
  const { events, all } = empty ? { events: [], all: [] } : buildEvents(Date.now());

  if (url.pathname === "/api/v1/events/featured") {
    const featured = events.filter((e) => onSale(e).some((t) => t.salesStatus === "ON_SALE"));
    json(response, 200, { data: featured.slice(0, 6).map(summary) });
    return true;
  }

  if (url.pathname === "/api/v1/events") {
    const q = url.searchParams.get("q")?.toLowerCase();
    const city = url.searchParams.get("city")?.toLowerCase();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const scope = JSON.stringify([q, city, from, to]);
    let offset = 0;
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      const [cursorScope, cursorOffset] = Buffer.from(cursor, "base64url").toString().split("|");
      if (cursorScope !== scope || !/^\d+$/.test(cursorOffset ?? "")) {
        json(response, 400, problem(400, "Validation failed"));
        return true;
      }
      offset = Number(cursorOffset);
    }
    const matching = events
      .filter((e) => !q || e.title.toLowerCase().includes(q))
      .filter((e) => !city || e.venue.city.toLowerCase() === city)
      .filter((e) => !from || Date.parse(e.startsAt) >= Date.parse(from))
      .filter((e) => !to || Date.parse(e.startsAt) < Date.parse(to))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const page = matching.slice(offset, offset + limit);
    const next = offset + limit < matching.length;
    json(response, 200, {
      data: page.map(summary),
      page: {
        limit,
        nextCursor: next
          ? Buffer.from(`${scope}|${String(offset + limit)}`).toString("base64url")
          : null,
      },
    });
    return true;
  }

  const slug = decodeURIComponent(url.pathname.slice("/api/v1/events/".length));
  const event = all.find((e) => e.slug === slug);
  if (event) json(response, 200, detail(event));
  else json(response, 404, problem(404, "Not found"));
  return true;
}

/** Stands in for the private bucket: any path is a photo, as the signed addresses lead. */
export function startStorage(port = STORAGE_PORT) {
  const photos = PALETTES.map((colours) => encodePng(1800, 1200, colours));
  createServer((request, response) => {
    const n = Number(/fake(\d+)/.exec(request.url ?? "")?.[1] ?? 0);
    response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
    response.end(photos[n % photos.length] ?? photos[0]);
  }).listen(port, "127.0.0.1");
}
