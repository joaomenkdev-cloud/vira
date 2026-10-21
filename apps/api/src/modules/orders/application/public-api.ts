// The only entry point other modules may use (docs/ARCHITECTURE.md#3-módulos-de-negócio).
export {
  OrderEvents,
  type OrderPaidHandler,
  type PaidOrder,
  type PaidOrderLine,
} from "./order-events.js";
