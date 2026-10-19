-- Event pictures (docs/DATA_MODEL.md#media_uploads, #events), N9. The browser sends the
-- original straight to the private bucket through a pre-signed URL; the API then checks
-- it, re-encodes it to WebP without metadata and points the event at the new object.
-- Each row tracks the objects of one upload, so a sweep can delete what nothing uses.

CREATE TYPE "upload_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

CREATE TABLE "media_uploads" (
    "id" UUID NOT NULL,
    -- The organizer profile that asked for the URL.
    "owner_id" UUID NOT NULL,
    -- The event the picture is for; NULL once that event is deleted (the sweep then
    -- removes the objects).
    "event_id" UUID,
    -- Where the browser sends the original. Made by the server, never by the client.
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    -- The exact size declared, and signed into the URL.
    "size_bytes" INTEGER NOT NULL,
    "status" "upload_status" NOT NULL DEFAULT 'PENDING',
    -- The re-encoded picture, once confirmed.
    "image_key" TEXT,
    -- End of the URL's validity.
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_uploads_object_key_format" CHECK ("object_key" ~ '^uploads/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
    CONSTRAINT "media_uploads_image_key_format" CHECK ("image_key" ~ '^events/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
    CONSTRAINT "media_uploads_content_type" CHECK ("content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
    -- 5 MB.
    CONSTRAINT "media_uploads_size" CHECK ("size_bytes" BETWEEN 1 AND 5242880),
    -- Only a confirmed upload has a picture, and it always has one.
    CONSTRAINT "media_uploads_confirmed" CHECK (
        ("status" = 'CONFIRMED') = ("image_key" IS NOT NULL)
        AND ("status" = 'CONFIRMED') = ("confirmed_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "media_uploads_object_key_key" ON "media_uploads"("object_key");
CREATE UNIQUE INDEX "media_uploads_image_key_key" ON "media_uploads"("image_key");
-- The sweep: what is still pending (or was rejected) after the URL expired.
CREATE INDEX "media_uploads_status_expires_at_idx" ON "media_uploads"("status", "expires_at");
CREATE INDEX "media_uploads_event_id_idx" ON "media_uploads"("event_id");

ALTER TABLE "media_uploads"
  ADD CONSTRAINT "media_uploads_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "organizer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_uploads"
  ADD CONSTRAINT "media_uploads_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- What the storefront needs to show the picture without layout shift: its size and a
-- tiny blurred preview (next/image `placeholder="blur"`, docs/DESIGN.md#28).
ALTER TABLE "events"
  ADD COLUMN "image_width" INTEGER,
  ADD COLUMN "image_height" INTEGER,
  ADD COLUMN "image_blur_data_url" TEXT,
  ADD CONSTRAINT "events_image_details" CHECK (
      ("image_key" IS NULL) = ("image_width" IS NULL)
      AND ("image_key" IS NULL) = ("image_height" IS NULL)
      AND ("image_key" IS NULL) = ("image_blur_data_url" IS NULL)
  ),
  ADD CONSTRAINT "events_image_size" CHECK ("image_width" BETWEEN 1 AND 10000 AND "image_height" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "events_image_blur_format" CHECK (
      "image_blur_data_url" LIKE 'data:image/webp;base64,%' AND char_length("image_blur_data_url") <= 2000
  ),
  ADD CONSTRAINT "events_image_alt_length" CHECK (char_length("image_alt") BETWEEN 3 AND 300);

-- Is this picture still some event's? Asked by the sweep for every confirmed upload.
CREATE INDEX "events_image_key_idx" ON "events"("image_key") WHERE "image_key" IS NOT NULL;
