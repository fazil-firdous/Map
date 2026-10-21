-- 1.4: "Today's special": a restaurant puts a dish (or one size of it) on a special price for a day or a week.
CREATE TABLE IF NOT EXISTS offers (
  id            serial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  item_id       int REFERENCES menu_items(id) ON DELETE CASCADE,
  v             int,                         -- size index, for dishes with sizes
  title         text NOT NULL,
  note          text,
  net_price     int,                         -- what the restaurant gets for the special
  price         int,                         -- what the customer pays (commission included)
  ends_at       timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offers_rest_idx ON offers (restaurant_id, ends_at);
