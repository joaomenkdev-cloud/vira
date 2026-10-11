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
import { isEmailVerified } from "../domain/user.js";
import { issueVerificationToken } from "../domain/verification-token.js";
import { verificationEmail } from "./emails.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "./ports/verification-token-repository.js";

/**
 * Runs in the worker when the outbox hands over `auth.verification_email_requested`.
 * The token is created here, at sending time, so the outbox, Redis and the job logs
 * only ever hold a user id: the token exists in the database as a hash and in the
 * e-mail, nowhere else.
 *
 * Delivery is at least once: if the job is retried after the e-mail went out, a
 * second link is sent and the first stops working (only the newest token is kept).
 */
@Injectable()
export class SendVerificationEmail {
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
    // The account was removed or verified in the meantime: nothing left to confirm.
    if (!user || isEmailVerified(user)) return;

    const { secret, record } = issueVerificationToken({
      id: this.ids.next(),
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      now: this.clock.now(),
    });
    await this.tokens.replaceUnused(record);

    await this.mailer.send(
      verificationEmail({
        to: user.email,
        name: user.name,
        webOrigin: this.config.http.webOrigin,
        token: secret,
      }),
    );
  }
}
