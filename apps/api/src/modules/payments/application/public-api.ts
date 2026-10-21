// The only entry point other modules may use (docs/ARCHITECTURE.md#3-módulos-de-negócio).
export {
  type PaymentRequest,
  PaymentIntents,
  type PaymentSession,
  PaymentsUnavailableError,
} from "./payment-intents.js";
export { PaymentGatewayError } from "./ports/payment-gateway.js";
