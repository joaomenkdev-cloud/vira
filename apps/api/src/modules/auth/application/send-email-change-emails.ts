import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { MAILER, type Mailer } from "../../../platform/mail/mailer.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { issueVerificationToken } from "../domain/verification-token.js";
import { emailChangeConfirmationEmail, emailChangeNoticeEmail } from "./emails.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "./ports/verification-token-repository.js";

/**
 * Runs in the worker when the outbox hands over `auth.email_change_requested`: the
 * confirmation link goes to the pending address (read now, so it is always the latest
 * one asked for), and a notice without a link goes to the current address.
 */
@Injectable()
export class SendEmailChangeEmails {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: VerificationTokenRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    // Gone, or the change was already confirmed: nothing left to send.
    if (!user?.pendingEmail) return;

    const { secret, record } = issueVerificationToken({
      id: this.ids.next(),
      userId: user.id,
      purpose: "EMAIL_CHANGE",
      now: this.clock.now(),
      newEmail: user.pendingEmail,
    });
    await this.tokens.replaceUnused(record);

    const webOrigin = this.config.http.webOrigin;
    await this.mailer.send(
      emailChangeConfirmationEmail({
        to: user.pendingEmail,
        name: user.name,
        webOrigin,
        token: secret,
      }),
    );
    await this.mailer.send(emailChangeNoticeEmail({ to: user.email, name: user.name, webOrigin }));
  }
}
