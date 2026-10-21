import { randomInt } from "node:crypto";

/** Crockford Base32: no I, L, O or U, so a code read aloud is not misheard. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * `VIRA-XXXX-XXXX`, random (40 bits): the readable reference of a ticket, for support and
 * the manual check-in, which only the event's organizer can use, with a rate limit.
 */
export function newTicketCode(): string {
  const group = () => Array.from({ length: 4 }, () => CROCKFORD[randomInt(32)]).join("");
  return `VIRA-${group()}-${group()}`;
}
