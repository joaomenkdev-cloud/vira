import type { MailMessage } from "../../../platform/mail/mailer.js";

/**
 * The e-mails of the authentication flows, in Portuguese, as plain text: there is no
 * markup to escape and nothing for a mail client to render. Links point at the web
 * app; the verification token travels in the fragment (`#token=`), which browsers
 * never send to servers or put in a `Referer` header.
 */

export function verificationEmail(input: {
  readonly to: string;
  readonly name: string;
  readonly webOrigin: string;
  readonly token: string;
}): MailMessage {
  const link = `${input.webOrigin}/verificar-email#token=${input.token}`;
  return {
    to: input.to,
    subject: "Confirme seu e-mail na Vira",
    text: [
      `Olá, ${input.name}!`,
      "",
      "Para ativar sua conta na Vira, confirme seu e-mail pelo link abaixo. Ele vale por 24 horas e só pode ser usado uma vez.",
      "",
      link,
      "",
      "Se você não criou uma conta na Vira, ignore esta mensagem.",
    ].join("\n"),
  };
}

export function accountExistsEmail(input: {
  readonly to: string;
  readonly name: string;
  readonly webOrigin: string;
}): MailMessage {
  return {
    to: input.to,
    subject: "Você já tem uma conta na Vira",
    text: [
      `Olá, ${input.name}!`,
      "",
      "Alguém tentou criar uma conta na Vira com este e-mail, mas você já tem uma. Nenhuma alteração foi feita.",
      "",
      `Para entrar: ${input.webOrigin}/entrar`,
      'Se esqueceu a senha, use a opção "Esqueci a senha" nessa mesma tela.',
      "",
      "Se foi você, é só entrar. Se não foi, pode ignorar esta mensagem.",
    ].join("\n"),
  };
}
