-- Install links: one per Instagram post, poster or restaurant, and what each one brought in
CREATE TABLE IF NOT EXISTS links (
  code text PRIMARY KEY,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS link_events (
  id bigserial PRIMARY KEY,
  code text NOT NULL,
  kind text NOT NULL,            -- visit | download | open | signup
  who text,                      -- anonymous daily fingerprint, so one person refreshing counts once
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_events_code ON link_events (code, kind);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ref text;      -- the link a customer came from (web app)
ALTER TABLE users ADD COLUMN IF NOT EXISTS heard text;    -- "How did you hear about us?" answer

-- Reviews: a photo with the rating, the restaurant's reply, and the owner can hide one
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_photo text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_reply text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rated_at timestamptz;
UPDATE orders SET rated_at = COALESCE(delivered_at, created_at) WHERE rating IS NOT NULL AND rated_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_reviews ON orders (restaurant_id, rated_at DESC) WHERE rating IS NOT NULL;

-- Push notifications: the phones a user is logged in on
CREATE TABLE IF NOT EXISTS push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_user ON push_tokens (user_id);
