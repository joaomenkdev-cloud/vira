-- Stripe events already applied (docs/DATA_MODEL.md#processed_webhook_events), V4. The row
-- is inserted in the same transaction as the event's effect: a redelivered event conflicts
-- on the primary key and changes nothing. The payload is never kept (it may carry billing
-- data).
CREATE TABLE "processed_webhook_events" (
    -- Stripe's event id.
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "processed_webhook_events_id_format" CHECK ("id" ~ '^evt_[A-Za-z0-9]{1,255}$'),
    CONSTRAINT "processed_webhook_events_type_format" CHECK ("type" ~ '^[a-z_]+(\.[a-z_]+)+$')
);

-- Retention (90 days): the purge looks at the oldest first.
CREATE INDEX "processed_webhook_events_processed_at_idx" ON "processed_webhook_events"("processed_at");

-- A payment that arrives after the buyer canceled is refunded: the order keeps the moment
-- it was canceled, so REFUNDED may now follow CANCELED as it already followed EXPIRED.
ALTER TABLE "orders" DROP CONSTRAINT "orders_status_timestamps";
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_timestamps" CHECK (
    CASE "status"
        WHEN 'PENDING' THEN "paid_at" IS NULL AND "expired_at" IS NULL AND "canceled_at" IS NULL AND "refunded_at" IS NULL
        WHEN 'PAID' THEN "paid_at" IS NOT NULL AND "canceled_at" IS NULL AND "refunded_at" IS NULL
        WHEN 'EXPIRED' THEN "expired_at" IS NOT NULL AND "paid_at" IS NULL AND "canceled_at" IS NULL AND "refunded_at" IS NULL
        WHEN 'CANCELED' THEN "canceled_at" IS NOT NULL AND "paid_at" IS NULL AND "expired_at" IS NULL AND "refunded_at" IS NULL
        WHEN 'REFUNDED' THEN "refunded_at" IS NOT NULL
    END
);
