-- 1.2: restaurants set what they receive (net); customer prices include the commission. Sizes per dish.
-- Additive only: nothing here changes or removes existing rows.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS net_price int;   -- what the restaurant gets; price = what the customer pays
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS variants jsonb;  -- sizes: [{"n": "Small", "net": 240, "p": 245}, ...]

-- Hand a restaurant to its owner: when this number logs in, the restaurant becomes theirs
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pending_owner_phone text;

-- New-customer offers (free delivery): Kezia pays the restaurant the fee by taking that much off its commission
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_amount int NOT NULL DEFAULT 0;
INSERT INTO settings VALUES ('promo_new_orders', '1'), ('promo_new_max', '400') ON CONFLICT DO NOTHING;

-- Suggestions from anyone using the app
CREATE TABLE IF NOT EXISTS suggestions (
  id         serial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  name       text,
  phone      text,
  kind       text NOT NULL DEFAULT 'customer',     -- customer | restaurant | rider
  text       text NOT NULL,
  status     text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);
