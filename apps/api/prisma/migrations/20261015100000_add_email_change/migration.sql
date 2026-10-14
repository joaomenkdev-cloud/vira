-- E-mail change with reconfirmation (docs/DATA_MODEL.md#users, #verification_tokens).
-- The new address waits in "users.pending_email" until the link sent to it is used; only
-- then does it replace "email". The link's token (purpose EMAIL_CHANGE) records the
-- address it was sent to, so a link can only ever confirm that address, even if the
-- person asked for another one in the meantime.

ALTER TYPE "token_purpose" ADD VALUE 'EMAIL_CHANGE';

ALTER TABLE "users"
  ADD COLUMN "pending_email" CITEXT,
  -- Same normalization and bounds as "email"; the API validates the format strictly.
  ADD CONSTRAINT "users_pending_email_normalized" CHECK ("pending_email" IS NULL OR "pending_email"::text = lower(btrim("pending_email"::text))),
  ADD CONSTRAINT "users_pending_email_length" CHECK ("pending_email" IS NULL OR char_length("pending_email"::text) <= 254),
  ADD CONSTRAINT "users_pending_email_format" CHECK ("pending_email" IS NULL OR "pending_email"::text ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  ADD CONSTRAINT "users_pending_email_differs" CHECK ("pending_email" IS NULL OR "pending_email" <> "email");

-- Set exactly for EMAIL_CHANGE tokens (the purpose is compared as text: a value added to
-- an enum cannot be referenced by name in the transaction that adds it).
ALTER TABLE "verification_tokens"
  ADD COLUMN "new_email" CITEXT,
  ADD CONSTRAINT "verification_tokens_new_email_only_for_email_change" CHECK (("new_email" IS NOT NULL) = ("purpose"::text = 'EMAIL_CHANGE'));
