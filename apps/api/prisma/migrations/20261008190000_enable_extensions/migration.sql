-- Case-insensitive text for e-mail addresses (users.email, orders.buyer_email).
CREATE EXTENSION IF NOT EXISTS citext;

-- Trigram indexes for event search (events.title).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
