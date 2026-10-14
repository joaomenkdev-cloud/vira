import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { OutboxJobData } from "@vira/shared";
import { z } from "zod";

import { JobHandlerRegistry } from "../../../platform/queue/job-handlers.js";
import { SendAccountExistsNotice } from "../application/send-account-exists-notice.js";
import { SendAccountNotices } from "../application/send-account-notices.js";
import { SendEmailChangeEmails } from "../application/send-email-change-emails.js";
import { SendPasswordResetEmail } from "../application/send-password-reset-email.js";
import { SendVerificationEmail } from "../application/send-verification-email.js";

/** Every message carries nothing but the account it is about. */
const payloadSchema = z.strictObject({ userId: z.uuid() });

function userIdOf(data: OutboxJobData): string {
  return payloadSchema.parse(data.payload, { reportInput: false }).userId;
}

/** Connects the authentication messages of the `email` queue to their use cases. */
@Injectable()
export class AuthJobHandlers implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly sendVerification: SendVerificationEmail,
    private readonly sendNotice: SendAccountExistsNotice,
    private readonly sendPasswordReset: SendPasswordResetEmail,
    private readonly sendEmailChange: SendEmailChangeEmails,
    private readonly sendNotices: SendAccountNotices,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: "email",
      type: "auth.verification_email_requested",
      handle: (data) => this.sendVerification.execute(userIdOf(data)),
    });
    this.registry.register({
      queue: "email",
      type: "auth.account_exists_notice",
      handle: (data) => this.sendNotice.execute(userIdOf(data)),
    });
    this.registry.register({
      queue: "email",
      type: "auth.password_reset_requested",
      handle: (data) => this.sendPasswordReset.execute(userIdOf(data)),
    });
    this.registry.register({
      queue: "email",
      type: "auth.password_changed_notice",
      handle: (data) => this.sendNotices.passwordChanged(userIdOf(data)),
    });
    this.registry.register({
      queue: "email",
      type: "auth.email_change_requested",
      handle: (data) => this.sendEmailChange.execute(userIdOf(data)),
    });
    this.registry.register({
      queue: "email",
      type: "auth.email_in_use_notice",
      handle: (data) => this.sendNotices.emailInUse(userIdOf(data)),
    });
  }
}
