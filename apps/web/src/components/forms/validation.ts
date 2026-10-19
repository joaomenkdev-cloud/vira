import {
  emailSchema,
  NAME_MAX_LENGTH,
  ORGANIZER_DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@vira/shared";

/*
 * Field checks run in the browser before anything is sent. They mirror the API's
 * contracts (`@vira/shared`) and phrase the problem as how to fix it. The API checks
 * everything again: these only save a round trip.
 */

/** Checks one field; `values` holds the whole form, for checks that compare fields. */
export type Validator = (
  value: string,
  values?: Readonly<Record<string, string>>,
) => string | undefined;

export const validateEmail: Validator = (value) => {
  if (value.trim() === "") return "Informe seu e-mail.";
  if (!emailSchema.safeParse(value).success) {
    return "Informe um e-mail válido, como ana@exemplo.com.";
  }
  return undefined;
};

export const validateName: Validator = (value) => {
  if (value.trim() === "") return "Informe seu nome.";
  if (value.trim().length > NAME_MAX_LENGTH) {
    return `Use até ${String(NAME_MAX_LENGTH)} caracteres.`;
  }
  return undefined;
};

export const validateOrganizerName: Validator = (value) => {
  if (value.trim() === "") return "Informe o nome que o público vai ver.";
  if (value.trim().length > ORGANIZER_DISPLAY_NAME_MAX_LENGTH) {
    return `Use até ${String(ORGANIZER_DISPLAY_NAME_MAX_LENGTH)} caracteres.`;
  }
  return undefined;
};

/** A password being created: the policy of ADR-0005. The value is never trimmed. */
export const validateNewPassword: Validator = (value) => {
  if (value === "") return "Crie uma senha.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use pelo menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Use até ${String(PASSWORD_MAX_LENGTH)} caracteres.`;
  }
  return undefined;
};

/**
 * A password the person already has. Its length is not checked against the policy:
 * a failed login must not hint at what the password looks like.
 */
export const validateCurrentPassword: Validator = (value) => {
  if (value === "") return "Informe sua senha.";
  if (value.length > PASSWORD_MAX_LENGTH) return "Senha incorreta.";
  return undefined;
};

export const NEW_PASSWORD_HINT = `Pelo menos ${String(PASSWORD_MIN_LENGTH)} caracteres. Frases longas são fáceis de lembrar e difíceis de adivinhar.`;
