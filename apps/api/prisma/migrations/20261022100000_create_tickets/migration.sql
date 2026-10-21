-- Tickets (docs/DATA_MODEL.md#tickets), V5. One row per unit of a paid order, issued in
-- the transaction that marks the order PAID. The trigger below refuses a ticket for an
-- order that is not PAID, or that does not match its order line, so no bug in the API
-- can issue a ticket that was not paid for.

CREATE TYPE "ticket_status" AS ENUM ('VALID', 'USED', 'CANCELED');

CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    -- Copied from the order and its line, so the check-in finds tickets by event.
    "event_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    -- VIRA-XXXX-XXXX, Crockford Base32, random (40 bits): for support and manual check-in.
    "code" TEXT NOT NULL,
    -- Personal data (docs/PRIVACY.md).
    "holder_name" TEXT NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'VALID',
    -- 16 random bytes inside the signed QR token (ADR-0008); a new one voids old QR codes.
    "qr_nonce" BYTEA NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "checked_in_by" UUID,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "canceled_at" TIMESTAMPTZ(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tickets_code_format" CHECK ("code" ~ '^VIRA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
    CONSTRAINT "tickets_holder_name_length" CHECK (char_length("holder_name") BETWEEN 1 AND 120),
    CONSTRAINT "tickets_qr_nonce_length" CHECK (octet_length("qr_nonce") = 16),
    CONSTRAINT "tickets_used_at" CHECK (("status" = 'USED') = ("used_at" IS NOT NULL)),
    CONSTRAINT "tickets_checked_in_by" CHECK ("checked_in_by" IS NULL OR "used_at" IS NOT NULL),
    CONSTRAINT "tickets_canceled_at" CHECK (("status" = 'CANCELED') = ("canceled_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "tickets_code_key" ON "tickets"("code");
CREATE INDEX "tickets_order_id_idx" ON "tickets"("order_id");
CREATE INDEX "tickets_order_item_id_idx" ON "tickets"("order_item_id");
CREATE INDEX "tickets_event_id_status_idx" ON "tickets"("event_id", "status");
CREATE INDEX "tickets_ticket_type_id_idx" ON "tickets"("ticket_type_id");
CREATE INDEX "tickets_checked_in_by_idx" ON "tickets"("checked_in_by");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: a ticket only for a PAID order, on a line of that order, with the
-- order's event and the line's ticket type, and never more tickets than the line bought.
CREATE FUNCTION "tickets_check_order"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    order_row RECORD;
    item_row RECORD;
BEGIN
    SELECT "status", "event_id" INTO order_row FROM "orders" WHERE "id" = NEW."order_id";
    IF NOT FOUND OR order_row."status" <> 'PAID' THEN
        RAISE EXCEPTION 'tickets are issued only for PAID orders'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'tickets_order_paid';
    END IF;
    SELECT "order_id", "ticket_type_id", "quantity" INTO item_row
        FROM "order_items" WHERE "id" = NEW."order_item_id";
    IF NOT FOUND
        OR item_row."order_id" <> NEW."order_id"
        OR item_row."ticket_type_id" <> NEW."ticket_type_id"
        OR order_row."event_id" <> NEW."event_id" THEN
        RAISE EXCEPTION 'ticket does not match its order line'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'tickets_order_line';
    END IF;
    IF (SELECT count(*) FROM "tickets" WHERE "order_item_id" = NEW."order_item_id") >= item_row."quantity" THEN
        RAISE EXCEPTION 'order line already has all its tickets'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'tickets_order_line_quantity';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "tickets_check_order"
    BEFORE INSERT ON "tickets"
    FOR EACH ROW EXECUTE FUNCTION "tickets_check_order"();
