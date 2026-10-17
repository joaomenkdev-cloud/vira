-- Events and their ticket types (docs/DATA_MODEL.md#events, #ticket_types), N8. The
-- rules that must never fail live here as CHECKs, so a bug in the API cannot publish an
-- incomplete event or sell more tickets than there are.

CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELED');

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "organizer_id" UUID NOT NULL,
    -- Derived from the title by the API, plus a short random suffix.
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description_md" TEXT NOT NULL DEFAULT '',
    -- Rendered and sanitized by the API from description_md; never taken from a client.
    "description_html" TEXT NOT NULL DEFAULT '',
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    -- IANA zone, validated by the API against the runtime's list.
    "timezone" TEXT NOT NULL,
    "venue_name" TEXT,
    "venue_address" TEXT,
    "venue_city" TEXT,
    "venue_state" CHAR(2),
    -- Key in the private bucket; set by the image upload (N9).
    "image_key" TEXT,
    "image_alt" TEXT,
    "image_credit_author" TEXT,
    "image_credit_url" TEXT,
    "image_license" TEXT,
    -- Only events created by the demo seed (ADR-0010).
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "events_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 80),
    CONSTRAINT "events_title_trimmed" CHECK ("title" = btrim("title")),
    CONSTRAINT "events_title_length" CHECK (char_length("title") BETWEEN 3 AND 120),
    CONSTRAINT "events_description_length" CHECK (char_length("description_md") <= 20000),
    CONSTRAINT "events_ends_after_start" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "events_timezone_length" CHECK (char_length("timezone") BETWEEN 1 AND 64),
    -- A venue is all four parts or none.
    CONSTRAINT "events_venue_complete" CHECK (
        ("venue_name" IS NULL) = ("venue_address" IS NULL)
        AND ("venue_name" IS NULL) = ("venue_city" IS NULL)
        AND ("venue_name" IS NULL) = ("venue_state" IS NULL)
    ),
    CONSTRAINT "events_venue_state_format" CHECK ("venue_state" ~ '^[A-Z]{2}$'),
    CONSTRAINT "events_image_alt_with_image" CHECK ("image_alt" IS NULL OR "image_key" IS NOT NULL),
    -- Demo photos are free-licensed and always credited (ADR-0010).
    CONSTRAINT "events_demo_image_credited" CHECK (
        NOT "is_demo" OR "image_key" IS NULL
        OR ("image_credit_author" IS NOT NULL AND "image_credit_url" IS NOT NULL AND "image_license" IS NOT NULL)
    ),
    -- What a published event needs that a row can show: a venue and an image with its
    -- text alternative. The ticket types and the future date are checked by the API.
    CONSTRAINT "events_published_complete" CHECK (
        "status" <> 'PUBLISHED'
        OR ("venue_name" IS NOT NULL AND "image_key" IS NOT NULL AND "image_alt" IS NOT NULL)
    ),
    -- Timestamps follow the status: a draft was never published nor canceled; a published
    -- event has its date; a canceled one has its date and reason.
    CONSTRAINT "events_status_timestamps" CHECK (
        CASE "status"
            WHEN 'DRAFT' THEN "published_at" IS NULL AND "canceled_at" IS NULL AND "cancel_reason" IS NULL
            WHEN 'PUBLISHED' THEN "published_at" IS NOT NULL AND "canceled_at" IS NULL AND "cancel_reason" IS NULL
            WHEN 'CANCELED' THEN "published_at" IS NOT NULL AND "canceled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL
        END
    ),
    CONSTRAINT "events_cancel_reason_length" CHECK (char_length("cancel_reason") BETWEEN 3 AND 500)
);

CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- The organizer's panel: their events, newest first.
CREATE INDEX "events_organizer_id_created_at_idx" ON "events"("organizer_id", "created_at");

-- The storefront (N10): published events by date, by city, and title search.
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");
CREATE INDEX "events_published_city_starts_at_idx" ON "events"("venue_city", "starts_at") WHERE "status" = 'PUBLISHED';
CREATE INDEX "events_title_trgm_idx" ON "events" USING GIN ("title" gin_trgm_ops);

ALTER TABLE "events"
  ADD CONSTRAINT "events_organizer_id_fkey"
  FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ticket_types" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "capacity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "max_per_order" INTEGER NOT NULL DEFAULT 10,
    "sales_start_at" TIMESTAMPTZ(3),
    "sales_end_at" TIMESTAMPTZ(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_types_name_trimmed" CHECK ("name" = btrim("name")),
    CONSTRAINT "ticket_types_name_length" CHECK (char_length("name") BETWEEN 1 AND 80),
    CONSTRAINT "ticket_types_description_length" CHECK (char_length("description") BETWEEN 1 AND 500),
    -- Paid tickets only in the MVP: at least R$ 1,00.
    CONSTRAINT "ticket_types_price_min" CHECK ("price_cents" >= 100),
    CONSTRAINT "ticket_types_price_max" CHECK ("price_cents" <= 10000000),
    CONSTRAINT "ticket_types_currency" CHECK ("currency" = 'BRL'),
    CONSTRAINT "ticket_types_capacity_positive" CHECK ("capacity" > 0),
    CONSTRAINT "ticket_types_sold_nonnegative" CHECK ("sold" >= 0),
    CONSTRAINT "ticket_types_reserved_nonnegative" CHECK ("reserved" >= 0),
    -- The inventory invariant (ADR-0007): the last line of defense against overbooking.
    CONSTRAINT "ticket_types_inventory" CHECK ("sold" + "reserved" <= "capacity"),
    CONSTRAINT "ticket_types_max_per_order" CHECK ("max_per_order" BETWEEN 1 AND 20),
    CONSTRAINT "ticket_types_sales_window" CHECK ("sales_end_at" > "sales_start_at"),
    CONSTRAINT "ticket_types_sort_order" CHECK ("sort_order" >= 0)
);

CREATE INDEX "ticket_types_event_id_sort_order_idx" ON "ticket_types"("event_id", "sort_order");

-- Deleting a draft takes its ticket types along; an event with sales is never deleted
-- (the API only deletes drafts, and a draft cannot have sold anything).
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
