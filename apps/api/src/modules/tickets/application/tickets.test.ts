import { describe, expect, it } from "vitest";

import type { TransactionContext } from "../../../platform/database/transaction.js";
import { Outbox } from "../../outbox/application/public-api.js";
import { verifyQrToken } from "../domain/qr-token.js";
import type { Ticket } from "../domain/ticket.js";
import { ticketsEmail } from "./emails.js";
import { GetTicket } from "./get-ticket.js";
import { IssueTickets } from "./issue-tickets.js";
import type {
  IssuedOrder,
  NewTicket,
  TicketPage,
  TicketRepository,
} from "./ports/ticket-repository.js";
import { QrTokens } from "./qr-tokens.js";
import { TicketNotFoundError } from "./errors.js";

const ORDER = "0192a0e4-2222-7000-8000-000000000001";
const EVENT = "0192a0e4-0000-7000-8000-0000000e0001";
const PISTA = "0192a0e4-0000-7000-8000-0000000f0002";
const CAMAROTE = "0192a0e4-0000-7000-8000-0000000f0001";
const T0 = new Date("2026-11-01T12:00:00Z");
const KEY = { kid: "t1", key: Buffer.alloc(32, 5) };

/** Tickets in memory, refusing a code that is taken, like the unique index. */
class InMemoryTickets implements TicketRepository {
  readonly rows: NewTicket[] = [];
  /** Codes that some other order already holds. */
  readonly taken = new Set<string>();
  insertCalls = 0;

  insert(tickets: readonly NewTicket[]): Promise<Set<string>> {
    this.insertCalls++;
    const inserted = new Set<string>();
    for (const ticket of tickets) {
      if (this.taken.has(ticket.code)) continue;
      this.taken.add(ticket.code);
      this.rows.push(ticket);
      inserted.add(ticket.id);
    }
    return Promise.resolve(inserted);
  }

  findOwned(ticketId: string, buyerId: string): Promise<Ticket | null> {
    const row = this.rows.find((t) => t.id === ticketId);
    if (!row || buyerId !== "ana") return Promise.resolve(null);
    return Promise.resolve({
      id: row.id,
      orderId: row.orderId,
      code: row.code,
      status: "VALID",
      holderName: row.holderName,
      ticketTypeName: "Pista",
      event: {
        id: EVENT,
        slug: "forro",
        title: "Noite de forró",
        startsAt: T0,
        endsAt: T0,
        timezone: "America/Sao_Paulo",
        venueName: null,
        venueCity: null,
        venueState: null,
      },
      issuedAt: row.issuedAt,
      usedAt: null,
      qrNonce: row.qrNonce,
    });
  }

  listOwned(): Promise<TicketPage> {
    return Promise.resolve({ tickets: [], next: undefined });
  }

  findIssuedOrder(): Promise<IssuedOrder | null> {
    return Promise.resolve(null);
  }
}

function setup() {
  const tickets = new InMemoryTickets();
  const clock = { now: () => T0 };
  let n = 0;
  const ids = { next: () => `0192a0e4-5555-7000-8000-${String(++n).padStart(12, "0")}` };
  const messages: { type: string; payload: Record<string, unknown> }[] = [];
  const outbox = new Outbox(
    {
      append: (message: { type: string; payload: Record<string, unknown> }) => {
        messages.push(message);
        return Promise.resolve();
      },
    } as never,
    clock,
    ids,
  );
  const issue = new IssueTickets(tickets, clock, ids, outbox);
  const qrTokens = new QrTokens({ tickets: { qrSigningKeys: [KEY] } } as never);
  return { tickets, messages, issue, get: new GetTicket(tickets, qrTokens) };
}

const paidOrder = {
  orderId: ORDER,
  eventId: EVENT,
  buyerName: "Ana Souza",
  lines: [
    {
      orderItemId: "0192a0e4-3333-7000-8000-000000000001",
      ticketTypeId: CAMAROTE,
      quantity: 1,
      holderNames: [],
    },
    {
      orderItemId: "0192a0e4-3333-7000-8000-000000000002",
      ticketTypeId: PISTA,
      quantity: 2,
      holderNames: ["Caio Lima", "Duda Reis"],
    },
  ],
};

describe("issuing tickets", () => {
  it("issues one ticket per unit, each with its holder, code and nonce, and announces them", async () => {
    const s = setup();
    await s.issue.execute(paidOrder, {} as TransactionContext);

    // A line without names is the buyer's own.
    expect(
      s.tickets.rows.map((t) => [t.orderItemId.slice(-1), t.ticketTypeId, t.holderName]),
    ).toEqual([
      ["1", CAMAROTE, "Ana Souza"],
      ["2", PISTA, "Caio Lima"],
      ["2", PISTA, "Duda Reis"],
    ]);
    for (const ticket of s.tickets.rows) {
      expect(ticket).toMatchObject({ orderId: ORDER, eventId: EVENT, issuedAt: T0 });
      expect(ticket.code).toMatch(/^VIRA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(ticket.qrNonce).toHaveLength(16);
    }
    expect(new Set(s.tickets.rows.map((t) => t.code)).size).toBe(3);
    expect(new Set(s.tickets.rows.map((t) => t.qrNonce.toString("hex"))).size).toBe(3);
    expect(s.messages).toEqual([
      expect.objectContaining({ type: "tickets.issued", payload: { orderId: ORDER } }),
    ]);
  });

  it("draws a new code for a ticket whose code is taken", async () => {
    const s = setup();
    const insert = s.tickets.insert.bind(s.tickets);
    let first = true;
    s.tickets.insert = (tickets) => {
      // The first code drawn is someone else's.
      if (first && tickets[0]) s.tickets.taken.add(tickets[0].code);
      first = false;
      return insert(tickets);
    };
    await s.issue.execute(paidOrder, {} as TransactionContext);
    expect(s.tickets.rows).toHaveLength(3);
    expect(s.tickets.insertCalls).toBe(2);
  });

  it("gives up, failing the payment's transaction, when codes keep colliding", async () => {
    const s = setup();
    s.tickets.insert = () => Promise.resolve(new Set());
    await expect(s.issue.execute(paidOrder, {} as TransactionContext)).rejects.toThrow(
      "Could not find free ticket codes",
    );
    expect(s.messages).toEqual([]);
  });
});

describe("showing a ticket", () => {
  it("gives its owner a QR token that verifies to the ticket and its nonce", async () => {
    const s = setup();
    await s.issue.execute(paidOrder, {} as TransactionContext);
    const [first] = s.tickets.rows;
    if (!first) throw new Error("no ticket");

    const { ticket, qrToken } = await s.get.execute({ id: "ana" }, first.id);
    expect(ticket.code).toBe(first.code);
    expect(verifyQrToken(qrToken, [KEY])).toEqual({ ticketId: first.id, nonce: first.qrNonce });
    await expect(s.get.execute({ id: "bia" }, first.id)).rejects.toThrow(TicketNotFoundError);
  });
});

describe("the tickets e-mail", () => {
  it("lists each ticket and links to the account, without any QR token", () => {
    const mail = ticketsEmail(
      {
        buyerName: "Ana",
        buyerEmail: "ana@exemplo.com",
        publicCode: "VIRA-ORD-3F8A-K2QX",
        event: {
          title: "Noite de forró",
          startsAt: new Date("2026-12-05T22:00:00Z"),
          timezone: "America/Sao_Paulo",
          venueName: "Circo Voador",
          venueCity: "Rio de Janeiro",
          venueState: "RJ",
        },
        tickets: [
          { code: "VIRA-7KQ2-M9XD", holderName: "Ana", ticketTypeName: "Pista" },
          { code: "VIRA-8ABC-DEFG", holderName: "Ana", ticketTypeName: "Camarote" },
        ],
      },
      "https://vira.example",
    );
    expect(mail.to).toBe("ana@exemplo.com");
    expect(mail.subject).toBe("Seus ingressos: Noite de forró");
    expect(mail.text).toContain("Seus 2 ingressos estão prontos para Noite de forró.");
    // 22:00 UTC is 19:00 in São Paulo.
    expect(mail.text).toContain("sábado, 5 de dezembro de 2026 às 19:00");
    expect(mail.text).toContain("Onde: Circo Voador, Rio de Janeiro/RJ");
    expect(mail.text).toContain("- VIRA-7KQ2-M9XD · Pista · Ana");
    expect(mail.text).toContain("https://vira.example/ingressos");
    expect(mail.text).toContain("Como a Vira trata seus dados: https://vira.example/privacidade");
    expect(mail.text).not.toMatch(/v1\.[a-z0-9]+\./);
  });
});
