import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { Public } from "../../../platform/security/access-policy.js";
import { HandleStripeWebhook } from "../application/handle-stripe-webhook.js";
import { PaymentsUnavailableError } from "../application/payment-intents.js";
import { InvalidWebhookSignatureError } from "../application/ports/webhook-verifier.js";

/**
 * Stripe's webhook (docs/API.md#pagamentos-payments). Public, without cookies or CSRF:
 * the signature is its only protection, and nothing happens before it is checked. Answers
 * `200` to every verified event, handled, repeated or not, so Stripe stops resending it.
 * The body parser keeps its raw bytes (`rawBody: true` in bootstrap/run.ts).
 */
@ApiExcludeController()
@Public()
@Controller("payments/stripe")
export class StripeWebhookController {
  constructor(private readonly handle: HandleStripeWebhook) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!request.rawBody || !signature) throw invalidSignature();
    try {
      await this.handle.execute(request.rawBody, signature);
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) throw invalidSignature();
      if (error instanceof PaymentsUnavailableError) {
        throw new ProblemException("payments-unavailable");
      }
      throw error;
    }
    return { received: true };
  }
}

function invalidSignature(): ProblemException {
  return new ProblemException("invalid-signature");
}
