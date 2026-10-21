-- The names of the ticket holders (docs/DATA_MODEL.md#order_items), V6: one per ticket of
-- the line, given by the buyer before paying and copied to each ticket when it is issued.
-- Personal data (docs/PRIVACY.md).

CREATE FUNCTION "holder_names_valid"("names" TEXT[]) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT bool_and(char_length("name") BETWEEN 1 AND 120 AND "name" = btrim("name"))
      FROM unnest("names") AS "name"
$$;

-- Empty until the buyer gives them; then exactly one per ticket.
ALTER TABLE "order_items" ADD COLUMN "holder_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_holder_names" CHECK (
    cardinality("holder_names") = 0
    OR (cardinality("holder_names") = "quantity" AND "holder_names_valid"("holder_names"))
);
