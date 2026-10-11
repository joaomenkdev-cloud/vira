import type { AddressInfo } from "node:net";

import { simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppConfig } from "../config/config.schema.js";
import { MailDeliveryError } from "./mailer.js";
import { SmtpMailer } from "./smtp-mailer.js";

interface Delivered {
  readonly recipients: string[];
  readonly sender: string | false;
  readonly subject: string | undefined;
  readonly text: string | undefined;
  readonly bcc: unknown;
}

const FROM = "Vira <no-reply@vira.localhost>";

function configFor(port: number): AppConfig {
  return { mail: { smtpUrl: `smtp://127.0.0.1:${port}`, from: FROM } } as AppConfig;
}

describe("SmtpMailer", () => {
  const delivered: Delivered[] = [];
  let server: SMTPServer;
  let port: number;
  let mailer: SmtpMailer;

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS", "AUTH"],
      onRcptTo(address, _session, callback) {
        if (address.address === "refused@exemplo.com") {
          const error = Object.assign(new Error("550 mailbox unavailable"), { responseCode: 550 });
          callback(error);
          return;
        }
        callback();
      },
      onData(stream, session, callback) {
        simpleParser(stream)
          .then((mail) => {
            delivered.push({
              recipients: session.envelope.rcptTo.map((rcpt) => rcpt.address),
              sender: session.envelope.mailFrom && session.envelope.mailFrom.address,
              subject: mail.subject,
              text: mail.text?.trim(),
              bcc: mail.bcc,
            });
            callback();
          })
          .catch((error: unknown) => {
            callback(error as Error);
          });
      },
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.server.address() as AddressInfo).port;
    mailer = new SmtpMailer(configFor(port));
  });

  afterAll(async () => {
    mailer.onModuleDestroy();
    await new Promise<void>((resolve) => {
      server.close(resolve);
    });
  });

  it("delivers a plain-text message from the configured sender", async () => {
    await mailer.send({
      to: "ana@exemplo.com",
      subject: "Confirme seu e-mail",
      text: "Olá, Ana!\nUse o link para confirmar.",
    });

    expect(delivered.at(-1)).toMatchObject({
      recipients: ["ana@exemplo.com"],
      sender: "no-reply@vira.localhost",
      subject: "Confirme seu e-mail",
      text: "Olá, Ana!\nUse o link para confirmar.",
    });
  });

  it("cannot be talked into extra recipients or headers through the subject", async () => {
    await mailer.send({
      to: "ana@exemplo.com",
      subject: "Oi\r\nBcc: atacante@exemplo.com",
      text: "corpo",
    });

    const message = delivered.at(-1);
    expect(message?.recipients).toEqual(["ana@exemplo.com"]);
    expect(message?.bcc).toBeUndefined();
  });

  it("reports a refused recipient without echoing the address or the server reply", async () => {
    const failure = await mailer
      .send({ to: "refused@exemplo.com", subject: "x", text: "y" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as MailDeliveryError).responseCode).toBe(550);
    expect((failure as MailDeliveryError).message).not.toContain("refused@exemplo.com");
    expect((failure as MailDeliveryError).message).not.toContain("mailbox unavailable");
  });

  it("fails with a delivery error while the mail server is down", async () => {
    const offline = new SmtpMailer(configFor(1));
    try {
      const failure = await offline
        .send({ to: "ana@exemplo.com", subject: "x", text: "y" })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(MailDeliveryError);
      expect((failure as MailDeliveryError).message).not.toContain("ana@exemplo.com");
    } finally {
      offline.onModuleDestroy();
    }
  });
});
