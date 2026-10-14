import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { MAILER, type Mailer } from "../../../platform/mail/mailer.js";
import { emailInUseEmail, passwordChangedEmail } from "./emails.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";

/**
 * Run in the worker: security notices that carry no link, sent to the account's
 * current address. They tell the owner about something done to (or with) their
 * account, so that someone else doing it does not go unnoticed.
 */
@Injectable()
export class SendAccountNotices {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** `auth.password_changed_notice`: the password was changed or reset. */
  async passwordChanged(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) return;
    await this.mailer.send(
      passwordChangedEmail({
        to: user.email,
        name: user.name,
        webOrigin: this.config.http.webOrigin,
      }),
    );
  }

  /** `auth.email_in_use_notice`: another account tried to move to this address. */
  async emailInUse(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) return;
    await this.mailer.send(
      emailInUseEmail({ to: user.email, name: user.name, webOrigin: this.config.http.webOrigin }),
    );
  }
}
