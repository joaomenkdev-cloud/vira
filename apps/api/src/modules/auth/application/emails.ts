import { type MailMessage, privacyNotice } from "../../../platform/mail/mailer.js";

/**
 * The e-mails of the authentication flows, in Portuguese, as plain text: there is no
 * markup to escape and nothing for a mail client to render. Links point at the web
 * app; the single-use tokens travel in the fragment (`#token=`), which browsers
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
      ...privacyNotice(input.webOrigin),
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
      ...privacyNotice(input.webOrigin),
    ].join("\n"),
  };
}

export function passwordResetEmail(input: {
  readonly to: string;
  readonly name: string;
  readonly webOrigin: string;
  readonly token: string;
}): MailMessage {
  const link = `${input.webOrigin}/redefinir-senha#token=${input.token}`;
  return {
    to: input.to,
    subject: "Redefina sua senha na Vira",
    text: [
      `Olá, ${input.name}!`,
      "",
      "Recebemos um pedido para redefinir a senha da sua conta na Vira. Para criar uma nova senha, use o link abaixo. Ele vale por 30 minutos e só pode ser usado uma vez.",
      "",
      link,
      "",
      "Ao redefinir a senha, você sai da conta em todos os dispositivos.",
      "Se você não pediu isso, ignore esta mensagem: sua senha continua a mesma.",
      ...privacyNotice(input.webOrigin),
    ].join("\n"),
  };
}

export function passwordChangedEmail(input: {
  readonly to: string;
  readonly name: string;
  readonly webOrigin: string;
}): MailMessage {
  return {
    to: input.to,
    subject: "Sua senha na Vira foi alterada",
    text: [
      `Olá, ${input.name}!`,
      "",
      "A senha da sua conta na Vira acabou de ser alterada.",
      "",
      "Se foi você, está tudo certo e não precisa fazer nada.",
      `Se não foi, redefina a senha agora em ${input.webOrigin}/esqueci-a-senha: isso encerra todas as sessões abertas na sua conta.`,
      ...privacyNotice(input.webOrigin),
    ].join("\n"),
  };
}

export function emailChangeConfirmationEmail(input: {
  readonly to: string;
  readonly name: string;
  readonly webOrigin: string;
  readonly token: string;
}): MailMessage {
  const link = `${input.webOrigin}/confirmar-email#token=${input.token}`;
  return {
    to: input.to,
    subject: "Confirme seu novo e-mail na Vira",
    text: [
      `Olá, ${input.name}!`,
      "",
      "Para passar a usar este endereço na sua conta da Vira, confirme pelo link abaixo. Ele vale por 24 horas e só pode ser usado uma vez.",
      "",
      link,
      "",
      "Até a confirmação, a conta continua com o e-mail anterior.",
      "Se você não pediu essa troca, ignore esta mensagem.",
      ...privacyNotice(input.webOrigin),
    ].join("\n"),
  };
}

export function emailChangeNoticeEmail(input: {
  readonly to: string;
  readonly name: string;
  readonly webOrigin: string;
}): MailMessage {
  return {
    to: input.to,
    subject: "Pedido de troca de e-mail na sua conta da Vira",
    text: [
      `Olá, ${input.name}!`,
      "",
      "Pediram para trocar o e-mail da sua conta na Vira por outro endereço. Enviamos um link de confirmação para o novo endereço; até ele ser usado, nada muda.",
      "",
      "Se foi você, é só confirmar pelo e-mail que chegou no novo endereço.",
      `Se não foi, troque sua senha agora em ${input.webOrigin}/esqueci-a-senha: alguém pode estar usando a sua conta.`,
      ...privacyNotice(input.webOrigin),
    ].join("\n"),
  };
}

export function emailInUseEmail(input: {
  readonly to: string;
  readonly name: string;
  readonly webOrigin: string;
}): MailMessage {
  return {
    to: input.to,
    subject: "Tentativa de usar seu e-mail na Vira",
    text: [
      `Olá, ${input.name}!`,
      "",
      "Alguém tentou passar a usar este e-mail em outra conta da Vira. Como ele já é o e-mail da sua conta, nada foi alterado.",
      "",
      `Para entrar: ${input.webOrigin}/entrar`,
      "Se foi você, saiba que cada e-mail só pode estar em uma conta. Se não foi, pode ignorar esta mensagem.",
      ...privacyNotice(input.webOrigin),
    ].join("\n"),
  };
}
