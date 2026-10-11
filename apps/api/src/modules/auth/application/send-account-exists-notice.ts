import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { MAILER, type Mailer } from "../../../platform/mail/mailer.js";
import { accountExistsEmail } from "./emails.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";

/**
 * Runs in the worker when the outbox hands over `auth.account_exists_notice`: tells
 * the owner of an address that someone tried to register it again. This is the only
 * place the difference between a new and a known address shows, and it shows in the
 * owner's mailbox, not in the answer to whoever made the request.
 */
@Injectable()
export class SendAccountExistsNotice {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) return;

    await this.mailer.send(
      accountExistsEmail({
        to: user.email,
        name: user.name,
        webOrigin: this.config.http.webOrigin,
      }),
    );
  }
}
