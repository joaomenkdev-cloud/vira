-- Append-only audit log of sensitive actions (docs/DATA_MODEL.md#audit_logs).

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    -- "<area>.<verb_or_event>", e.g. "order.paid", "auth.refresh_reuse_detected".
    CONSTRAINT "audit_logs_action_format" CHECK ("action" ~ '^[a-z]+\.[a-z_]+$'),
    CONSTRAINT "audit_logs_actor_role_valid" CHECK ("actor_role" IN ('SYSTEM', 'BUYER', 'ORGANIZER', 'ADMIN')),
    -- The system acts without a user; every other role names its actor.
    CONSTRAINT "audit_logs_actor_matches_role" CHECK (("actor_role" = 'SYSTEM') = ("actor_id" IS NULL)),
    CONSTRAINT "audit_logs_metadata_is_object" CHECK (jsonb_typeof("metadata") = 'object')
);

CREATE INDEX "audit_logs_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at");
CREATE INDEX "audit_logs_actor_id_occurred_at_idx" ON "audit_logs"("actor_id", "occurred_at");
CREATE INDEX "audit_logs_action_occurred_at_idx" ON "audit_logs"("action", "occurred_at");

-- Rows can only be inserted. The trigger applies to every role, including the
-- table owner; in production the application role additionally receives only
-- INSERT and SELECT on this table (docs/SECURITY_MODEL.md).
CREATE FUNCTION "audit_logs_reject_changes"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_reject_changes"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_reject_changes"();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_logs" FROM PUBLIC;
