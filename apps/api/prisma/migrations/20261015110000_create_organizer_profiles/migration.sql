-- Organizer profiles (docs/DATA_MODEL.md#organizer_profiles): the public name under
-- which a user publishes events. At most one per user, created by POST /me/organizer.

CREATE TABLE "organizer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    -- Derived from the display name by the API (lower case ASCII words joined by "-").
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizer_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organizer_profiles_display_name_trimmed" CHECK ("display_name" = btrim("display_name")),
    CONSTRAINT "organizer_profiles_display_name_length" CHECK (char_length("display_name") BETWEEN 1 AND 80),
    CONSTRAINT "organizer_profiles_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 80)
);

CREATE UNIQUE INDEX "organizer_profiles_user_id_key" ON "organizer_profiles"("user_id");

CREATE UNIQUE INDEX "organizer_profiles_slug_key" ON "organizer_profiles"("slug");

ALTER TABLE "organizer_profiles"
  ADD CONSTRAINT "organizer_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
