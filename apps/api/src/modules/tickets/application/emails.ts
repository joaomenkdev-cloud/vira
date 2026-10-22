import { type MailMessage, privacyNotice } from "../../../platform/mail/mailer.js";
import type { IssuedOrder } from "./ports/ticket-repository.js";

/**
 * The e-mail that delivers the tickets of a paid order, in Portuguese, as plain text. It
 * names each ticket by its code and links to the buyer's tickets in the web app; the QR
 * token never travels by e-mail (ADR-0008): it is shown only to the signed-in owner.
 */
export function ticketsEmail(order: IssuedOrder, webOrigin: string): MailMessage {
  const when = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: order.event.timezone,
  }).format(order.event.startsAt);
  const count = order.tickets.length;
  return {
    to: order.buyerEmail,
    subject: `Seus ingressos: ${order.event.title}`,
    text: [
      `Olá, ${order.buyerName}!`,
      "",
      `Pagamento confirmado. ${count === 1 ? "Seu ingresso está pronto" : `Seus ${count} ingressos estão prontos`} para ${order.event.title}.`,
      "",
      `Quando: ${when}`,
      ...(order.event.venueName
        ? [
            `Onde: ${order.event.venueName}, ${order.event.venueCity ?? ""}/${order.event.venueState ?? ""}`,
          ]
        : []),
      `Pedido: ${order.publicCode}`,
      "",
      ...order.tickets.map(
        (ticket) => `- ${ticket.code} · ${ticket.ticketTypeName} · ${ticket.holderName}`,
      ),
      "",
      `O QR Code de cada ingresso fica na sua conta: ${webOrigin}/ingressos`,
      "Apresente-o na entrada, no celular ou impresso. Cada ingresso vale para uma entrada.",
      ...privacyNotice(webOrigin),
    ].join("\n"),
  };
}
