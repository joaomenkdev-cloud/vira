-- Orders and their items (docs/DATA_MODEL.md#orders, #order_items), V1. An order holds
-- its tickets in `ticket_types.reserved` while PENDING (ADR-0007); the rules that must
-- never fail (one pending order per buyer and event, idempotency, timestamps of each
-- status) live here, so a bug in the API cannot break them.

CREATE TYPE "order_status" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED', 'REFUNDED');

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    -- VIRA-ORD-XXXX-XXXX, Crockford Base32, random: a reference for support, not a secret.
    "public_code" TEXT NOT NULL,
    "buyer_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'PENDING',
    -- Sum of the items, computed by the API from the prices in the database.
    "total_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "extension_count" SMALLINT NOT NULL DEFAULT 0,
    -- Sent by the client; with request_hash, a repeated request finds its order.
    "idempotency_key" TEXT NOT NULL,
    -- SHA-256 of the normalized body: the same key with another body is refused.
    "request_hash" BYTEA NOT NULL,
    "stripe_payment_intent_id" TEXT,
    -- Copies taken at purchase time, for the receipt (docs/PRIVACY.md). Personal data.
    "buyer_name" TEXT NOT NULL,
    "buyer_email" CITEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_public_code_format" CHECK ("public_code" ~ '^VIRA-ORD-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
    -- Stripe's ceiling for one BRL payment.
    CONSTRAINT "orders_total_range" CHECK ("total_cents" BETWEEN 1 AND 99999999),
    CONSTRAINT "orders_currency" CHECK ("currency" = 'BRL'),
    CONSTRAINT "orders_expires_after_creation" CHECK ("expires_at" > "created_at"),
    -- A single extension of the reservation (WCAG 2.2.1).
    CONSTRAINT "orders_extension_count" CHECK ("extension_count" BETWEEN 0 AND 1),
    CONSTRAINT "orders_idempotency_key_length" CHECK (char_length("idempotency_key") BETWEEN 1 AND 64),
    CONSTRAINT "orders_request_hash_length" CHECK (octet_length("request_hash") = 32),
    -- Each status carries the timestamp of the transition that led to it, and only that
    -- one, except a late payment, which may follow an expiration (EXPIRED → PAID, V4).
    CONSTRAINT "orders_status_timestamps" CHECK (
        CASE "status"
            WHEN 'PENDING' THEN "paid_at" IS NULL AND "expired_at" IS NULL AND "canceled_at" IS NULL AND "refunded_at" IS NULL
            WHEN 'PAID' THEN "paid_at" IS NOT NULL AND "canceled_at" IS NULL AND "refunded_at" IS NULL
            WHEN 'EXPIRED' THEN "expired_at" IS NOT NULL AND "paid_at" IS NULL AND "canceled_at" IS NULL AND "refunded_at" IS NULL
            WHEN 'CANCELED' THEN "canceled_at" IS NOT NULL AND "paid_at" IS NULL AND "expired_at" IS NULL AND "refunded_at" IS NULL
            WHEN 'REFUNDED' THEN "refunded_at" IS NOT NULL AND "canceled_at" IS NULL
        END
    )
);

CREATE UNIQUE INDEX "orders_public_code_key" ON "orders"("public_code");
CREATE UNIQUE INDEX "orders_buyer_id_idempotency_key_key" ON "orders"("buyer_id", "idempotency_key");
CREATE UNIQUE INDEX "orders_stripe_payment_intent_id_key" ON "orders"("stripe_payment_intent_id");
-- "My orders", newest first.
CREATE INDEX "orders_buyer_id_created_at_idx" ON "orders"("buyer_id", "created_at" DESC);
-- The expiration sweep (V2) only looks at pending orders.
CREATE INDEX "orders_pending_expires_at_idx" ON "orders"("expires_at") WHERE "status" = 'PENDING';
CREATE INDEX "orders_event_id_status_idx" ON "orders"("event_id", "status");
-- Anti-hoarding: at most one pending order per buyer and event.
CREATE UNIQUE INDEX "orders_one_pending_per_buyer_event" ON "orders"("buyer_id", "event_id") WHERE "status" = 'PENDING';

-- Accounts are anonymized, never deleted, while they have orders (docs/PRIVACY.md);
-- an event with orders is published, and published events are never deleted.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_buyer_id_fkey"
  FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    -- Copy of the price when the tickets were reserved.
    "unit_price_cents" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_quantity" CHECK ("quantity" BETWEEN 1 AND 20),
    CONSTRAINT "order_items_unit_price" CHECK ("unit_price_cents" BETWEEN 100 AND 10000000)
);

CREATE UNIQUE INDEX "order_items_order_id_ticket_type_id_key" ON "order_items"("order_id", "ticket_type_id");
-- Whether a ticket type was ever ordered (it can no longer be deleted).
CREATE INDEX "order_items_ticket_type_id_idx" ON "order_items"("ticket_type_id");

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A ticket type that was ever ordered is kept: the order shows its name.
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_ticket_type_id_fkey"
  FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
