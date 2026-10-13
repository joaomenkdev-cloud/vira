-- Refresh-token sessions (docs/DATA_MODEL.md#sessions, ADR-0005). One row per refresh
-- token; every token issued from the same login shares a family_id, which is also the
-- session id ("sid") carried by the access token.

CREATE TYPE "session_revoke_reason" AS ENUM ('LOGOUT', 'REUSE_DETECTED', 'PASSWORD_CHANGED', 'ACCOUNT_DELETED');

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    -- When the person logged in; copied unchanged to every rotation of the family.
    "authenticated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    -- 30 days after the login, whatever happens; copied to every rotation.
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    -- 7 days of inactivity, capped by the absolute expiry.
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" "session_revoke_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    -- SHA-256 digest of the refresh token; the token itself only exists in the cookie.
    CONSTRAINT "sessions_hash_is_sha256" CHECK (octet_length("token_hash") = 32),
    CONSTRAINT "sessions_created_after_login" CHECK ("created_at" >= "authenticated_at"),
    CONSTRAINT "sessions_expires_after_creation" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "sessions_expiry_within_absolute" CHECK ("expires_at" <= "absolute_expires_at"),
    CONSTRAINT "sessions_rotated_after_creation" CHECK ("rotated_at" IS NULL OR "rotated_at" >= "created_at"),
    CONSTRAINT "sessions_revoked_after_creation" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at"),
    CONSTRAINT "sessions_revocation_has_reason" CHECK (("revoked_at" IS NULL) = ("revoke_reason" IS NULL))
);

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
