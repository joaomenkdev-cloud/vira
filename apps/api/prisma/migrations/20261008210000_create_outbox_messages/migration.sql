-- Transactional outbox (docs/DATA_MODEL.md#outbox_messages).

CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "dispatched_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_messages_type_format" CHECK ("type" ~ '^[a-z]+\.[a-z_]+$'),
    -- Payloads carry identifiers only, as a JSON object (never a bare string or array).
    CONSTRAINT "outbox_messages_payload_is_object" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "outbox_messages_attempts_not_negative" CHECK ("attempts" >= 0),
    -- A message can only be dispatched after at least one attempt.
    CONSTRAINT "outbox_messages_dispatched_after_attempt" CHECK ("dispatched_at" IS NULL OR "attempts" > 0)
);

-- Serves the dispatcher query: undispatched messages that are due, oldest first.
CREATE INDEX "outbox_messages_dispatched_at_available_at_created_at_idx"
  ON "outbox_messages"("dispatched_at", "available_at", "created_at");
