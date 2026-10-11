-- Accounts and single-use tokens (docs/DATA_MODEL.md#users, #verification_tokens).

CREATE TYPE "role" AS ENUM ('BUYER', 'ORGANIZER', 'ADMIN');

CREATE TYPE "token_purpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "role" NOT NULL DEFAULT 'BUYER',
    "email_verified_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "anonymized_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    -- Addresses are stored trimmed and in lower case; the API normalizes before inserting,
    -- this keeps every other writer honest. The format check is deliberately loose (exactly
    -- one "@", no spaces): anonymized accounts use "deleted+<id>@invalid", and the API's Zod
    -- schema does the strict validation.
    CONSTRAINT "users_email_normalized" CHECK ("email"::text = lower(btrim("email"::text))),
    CONSTRAINT "users_email_length" CHECK (char_length("email"::text) <= 254),
    CONSTRAINT "users_email_format" CHECK ("email"::text ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
    CONSTRAINT "users_name_trimmed" CHECK ("name" = btrim("name")),
    CONSTRAINT "users_name_length" CHECK (char_length("name") BETWEEN 1 AND 120),
    -- Only argon2id hashes (PHC strings) are accepted; NULL means "no password" (social login).
    CONSTRAINT "users_password_hash_argon2id" CHECK ("password_hash" IS NULL OR "password_hash" LIKE '$argon2id$%'),
    CONSTRAINT "users_failed_login_count_not_negative" CHECK ("failed_login_count" >= 0)
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "token_purpose" NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id"),
    -- SHA-256 digest of the token; the token itself is never stored.
    CONSTRAINT "verification_tokens_hash_is_sha256" CHECK (octet_length("token_hash") = 32),
    CONSTRAINT "verification_tokens_expires_after_creation" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "verification_tokens_used_after_creation" CHECK ("used_at" IS NULL OR "used_at" >= "created_at")
);

CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");

CREATE INDEX "verification_tokens_user_id_purpose_idx" ON "verification_tokens"("user_id", "purpose");

ALTER TABLE "verification_tokens"
  ADD CONSTRAINT "verification_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
