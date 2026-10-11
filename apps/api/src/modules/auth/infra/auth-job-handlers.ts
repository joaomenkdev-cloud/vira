import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { OutboxJobData } from "@vira/shared";
import { z } from "zod";

import { JobHandlerRegistry } from "../../../platform/queue/job-handlers.js";
import { SendAccountExistsNotice } from "../application/send-account-exists-notice.js";
import { SendVerificationEmail } from "../application/send-verification-email.js";

/** Both messages carry nothing but the account they are about. */
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
  }
}
