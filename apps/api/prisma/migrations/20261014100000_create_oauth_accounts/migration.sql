-- Social login links (docs/DATA_MODEL.md#oauth_accounts, ADR-0005). One row per provider
-- account; only the provider's account id is kept, never its access or refresh tokens.

CREATE TYPE "oauth_provider" AS ENUM ('GOOGLE', 'GITHUB');

CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "oauth_provider" NOT NULL,
    -- Google's "sub" (up to 255 ASCII characters) or GitHub's numeric user id.
    "provider_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oauth_accounts_provider_account_id_length" CHECK (char_length("provider_account_id") BETWEEN 1 AND 255)
);

-- A provider account opens exactly one Vira account.
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");

CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

ALTER TABLE "oauth_accounts"
  ADD CONSTRAINT "oauth_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
