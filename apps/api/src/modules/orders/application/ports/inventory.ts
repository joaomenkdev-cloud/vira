import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { SaleEvent } from "../../domain/reservation-policy.js";

export type Reservation =
  | { readonly reserved: true; readonly unitPriceCents: number }
  | { readonly reserved: false; readonly available: number };

/**
 * The stock of ticket types (`capacity`, `sold`, `reserved`, ADR-0007). Every change is
 * one conditional statement, so concurrent orders never sell more than there is; the
 * `CHECK (sold + reserved <= capacity)` backs it up.
 */
export interface Inventory {
  /**
   * A published or canceled event with its ticket types; `null` for a draft or an unknown
   * id. The event row stays share-locked until the transaction ends, so it cannot be
   * canceled, nor its ticket types edited, while the order is being made.
   */
  findEventForSale(eventId: string, tx: TransactionContext): Promise<SaleEvent | null>;

  /**
   * Holds `quantity` tickets if that many are left, answering the price they were held
   * at, or how many are left when not enough are.
   */
  reserve(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<Reservation>;

  /** Gives back tickets a pending order held. */
  release(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<void>;

  /** Turns tickets a pending order held into sold ones (it was paid). */
  sell(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<void>;

  /**
   * Sells `quantity` tickets that were not held, if that many are left: a late payment of
   * an order whose reservation ended. Answers whether it did.
   */
  sellUnheld(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<boolean>;

  /** Undoes `sellUnheld`, in the same transaction, when another line of the order fell short. */
  unsell(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<void>;
}

export const INVENTORY = Symbol("INVENTORY");
