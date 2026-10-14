import { Inject, Injectable } from "@nestjs/common";
import type { RegisterRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import { newUser, type User } from "../domain/user.js";
import { NewPasswords } from "./new-passwords.js";
import { type RequestContext, withRequestId } from "./request-context.js";
import {
  EmailAlreadyRegisteredError,
  USER_REPOSITORY,
  type UserRepository,
} from "./ports/user-repository.js";

/**
 * Creates an account, or, for an e-mail that already has one, tells its owner so.
 * The caller cannot tell the two apart (docs/SECURITY_MODEL.md, 3.1, "Enumeração de
 * contas"): the result is the same, and so is, as far as possible, the time it takes.
 */
@Injectable()
export class RegisterUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly newPasswords: NewPasswords,
    private readonly outbox: Outbox,
    private readonly audit: AuditLog,
  ) {}

  /** @throws BreachedPasswordError when the password appears in known breaches. */
  async execute(request: RegisterRequest, context: RequestContext = {}): Promise<void> {
    // The password check and hash come first and run for new and known e-mails alike:
    // doing them only for new accounts would make the response (its status or its time)
    // reveal which addresses are registered.
    const passwordHash = await this.newPasswords.hash(request.password);

    let existing = await this.users.findByEmail(request.email);
    if (!existing) {
      const user = newUser({
        id: this.ids.next(),
        name: request.name,
        email: request.email,
        passwordHash,
        now: this.clock.now(),
      });
      if (await this.create(user)) {
        await this.audit.record(
          { action: "auth.registered", entityId: user.id, metadata: {} },
          { actor: { id: user.id, role: user.role }, ...withRequestId(context) },
        );
        return;
      }
      // Someone registered the same address between the lookup and the insert.
      existing = await this.users.findByEmail(request.email);
    }

    if (existing) {
      await this.outbox.publish({
        type: "auth.account_exists_notice",
        payload: { userId: existing.id },
      });
    }
  }

  /** The account and the request for its verification e-mail are saved together. */
  private async create(user: User): Promise<boolean> {
    try {
      await this.transactions.run(async (tx) => {
        await this.users.create(user, tx);
        await this.outbox.publish(
          { type: "auth.verification_email_requested", payload: { userId: user.id } },
          tx,
        );
      });
      return true;
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) return false;
      throw error;
    }
  }
}
