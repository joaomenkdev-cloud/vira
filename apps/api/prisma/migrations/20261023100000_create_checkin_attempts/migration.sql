-- Check-in attempts (docs/DATA_MODEL.md#checkin_attempts), V8. Every read at the door,
-- valid or not, with the operator who made it: for the audit of the entrance and to spot
-- fraud. Deleted 90 days after the event (docs/PRIVACY.md).

CREATE TYPE "checkin_result" AS ENUM ('VALID', 'ALREADY_USED', 'WRONG_EVENT', 'INVALID');
CREATE TYPE "checkin_method" AS ENUM ('QR', 'CODE');

CREATE TABLE "checkin_attempts" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    -- Null when the read names no ticket (a token or a code that does not exist).
    "ticket_id" UUID,
    "operator_id" UUID NOT NULL,
    "result" "checkin_result" NOT NULL,
    "method" "checkin_method" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checkin_attempts_pkey" PRIMARY KEY ("id"),
    -- A valid or repeated entry always names its ticket.
    CONSTRAINT "checkin_attempts_ticket" CHECK (
        "result" NOT IN ('VALID', 'ALREADY_USED', 'WRONG_EVENT') OR "ticket_id" IS NOT NULL
    )
);

CREATE INDEX "checkin_attempts_event_id_created_at_idx" ON "checkin_attempts"("event_id", "created_at");
CREATE INDEX "checkin_attempts_ticket_id_idx" ON "checkin_attempts"("ticket_id");
CREATE INDEX "checkin_attempts_operator_id_idx" ON "checkin_attempts"("operator_id");

ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
