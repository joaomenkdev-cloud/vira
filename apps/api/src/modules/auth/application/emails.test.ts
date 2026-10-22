import { describe, expect, it } from "vitest";

import {
  accountExistsEmail,
  emailChangeConfirmationEmail,
  emailChangeNoticeEmail,
  emailInUseEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
} from "./emails.js";

const input = {
  to: "ana@exemplo.com",
  name: "Ana",
  webOrigin: "https://vira.exemplo",
  token: "a".repeat(43),
};

describe("authentication e-mails", () => {
  it("all end with the link to the privacy policy", () => {
    for (const mail of [
      verificationEmail(input),
      accountExistsEmail(input),
      passwordResetEmail(input),
      passwordChangedEmail(input),
      emailChangeConfirmationEmail(input),
      emailChangeNoticeEmail(input),
      emailInUseEmail(input),
    ]) {
      expect(
        mail.text.endsWith("Como a Vira trata seus dados: https://vira.exemplo/privacidade"),
      ).toBe(true);
    }
  });
});
