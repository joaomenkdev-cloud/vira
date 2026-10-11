import type { Mailpit } from "./infrastructure.js";

export interface ReceivedMail {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

interface MessageSummary {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

const POLL_INTERVAL_MS = 100;

/** Reads the e-mails Mailpit received, through its HTTP API. */
export class MailpitInbox {
  constructor(private readonly mailpit: Mailpit) {}

  /** Every message sent to `address`, oldest first. */
  async messagesTo(address: string): Promise<ReceivedMail[]> {
    const query = encodeURIComponent(`to:"${address}"`);
    const list = await this.get<{ messages: MessageSummary[] }>(`/api/v1/search?query=${query}`);
    const summaries = [...list.messages].reverse(); // the API answers newest first
    return Promise.all(
      summaries.map(async (summary) => {
        const message = await this.get<{ Text: string }>(`/api/v1/message/${summary.ID}`);
        return {
          id: summary.ID,
          to: summary.To[0]?.Address ?? "",
          subject: summary.Subject,
          text: message.Text,
        };
      }),
    );
  }

  /** Waits until `address` has received `count` messages, and returns them. */
  async waitFor(address: string, count = 1, timeoutMs = 20_000): Promise<ReceivedMail[]> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const messages = await this.messagesTo(address);
      if (messages.length >= count) return messages;
      if (Date.now() > deadline) {
        throw new Error(`Expected ${count} e-mail(s) for the address, got ${messages.length}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  /** Gives up waiting after a while and returns what arrived: for "no e-mail was sent" checks. */
  async settle(address: string, waitMs = 1_500): Promise<ReceivedMail[]> {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return this.messagesTo(address);
  }

  /** The verification token in the link of a message, as the web page would read it. */
  static tokenIn(mail: ReceivedMail): string {
    const match = /\/verificar-email#token=([A-Za-z0-9_-]{43})/.exec(mail.text);
    if (!match?.[1]) throw new Error("The e-mail has no verification link");
    return match[1];
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.mailpit.apiUrl}${path}`);
    if (!response.ok) throw new Error(`Mailpit answered ${response.status} for ${path}`);
    return (await response.json()) as T;
  }
}
