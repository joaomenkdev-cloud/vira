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
import { passwordResetEmail } from "./emails.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "./ports/verification-token-repository.js";

/**
 * Runs in the worker when the outbox hands over `auth.password_reset_requested`. Like the
 * verification e-mail, the token is created at sending time, so it exists only as a hash
 * in the database and in the e-mail; each new link voids the previous one.
 */
@Injectable()
export class SendPasswordResetEmail {
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
    if (!user) return;

    const { secret, record } = issueVerificationToken({
      id: this.ids.next(),
      userId: user.id,
      purpose: "PASSWORD_RESET",
      now: this.clock.now(),
    });
    await this.tokens.replaceUnused(record);

    await this.mailer.send(
      passwordResetEmail({
        to: user.email,
        name: user.name,
        webOrigin: this.config.http.webOrigin,
        token: secret,
      }),
    );
  }
}
