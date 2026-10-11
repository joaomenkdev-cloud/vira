import { Global, Module } from "@nestjs/common";

import { MAILER } from "./mailer.js";
import { SmtpMailer } from "./smtp-mailer.js";

@Global()
@Module({
  providers: [{ provide: MAILER, useClass: SmtpMailer }],
  exports: [MAILER],
})
export class MailModule {}
