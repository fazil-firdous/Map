-- Kezia's Food: food ordering for Kulgam. Restaurants deliver with their own riders and are paid directly
-- (UPI to the restaurant, or cash). The platform earns a commission (percent of food value) per delivered order.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text UNIQUE NOT NULL,
  name       text,
  role       text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  banned     boolean NOT NULL DEFAULT false,
  no_shows   int NOT NULL DEFAULT 0,               -- cash orders refused at the door; 2+ disables cash for them
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS otps (
  phone      text PRIMARY KEY,
  code_hash  text NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Platform settings (commission %, platform UPI for collecting commission, support number)
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);
INSERT INTO settings VALUES ('commission_pct', '8'), ('platform_upi', '""'), ('platform_name', '"Kezia''s Food"'), ('support_phone', '""')
  ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS restaurants (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  owner_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  phone          text,
  area           text,
  address        text,
  lat            double precision NOT NULL,
  lon            double precision NOT NULL,
  cuisines       text,
  photo          text,                              -- cover photo (file under /uploads or app asset path)
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'test')),
  is_open        boolean NOT NULL DEFAULT false,
  upi_id         text,
  upi_name       text,
  cod            boolean NOT NULL DEFAULT true,
  prep_min       int NOT NULL DEFAULT 25,
  base_fee       int NOT NULL DEFAULT 30,           -- delivery: fixed fee for the first base_km by road
  base_km        numeric NOT NULL DEFAULT 2,
  per_km         int NOT NULL DEFAULT 10,           -- then per started km
  max_km         numeric NOT NULL DEFAULT 6,
  min_order      int NOT NULL DEFAULT 150,
  packing        int NOT NULL DEFAULT 10,
  free_above     int,                               -- free delivery above this food value (optional)
  accept_min     int NOT NULL DEFAULT 3,
  pay_min        int NOT NULL DEFAULT 10,
  cancel_min     int NOT NULL DEFAULT 2,
  commission_pct numeric,                           -- per-restaurant override of the platform commission
  hours          text,
  rating_sum     int NOT NULL DEFAULT 0,
  rating_count   int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- Managers and riders, by phone number (they can be added before they install the app)
CREATE TABLE IF NOT EXISTS staff (
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  phone         text NOT NULL,
  name          text,
  role          text NOT NULL CHECK (role IN ('manager', 'rider')),
  PRIMARY KEY (restaurant_id, phone)
);
CREATE TABLE IF NOT EXISTS menu_sections (
  id            serial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  sort          int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS menu_items (
  id            serial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  section_id    int REFERENCES menu_sections(id) ON DELETE SET NULL,
  name          text NOT NULL,
  description   text,
  price         int NOT NULL CHECK (price > 0),
  veg           boolean NOT NULL DEFAULT false,
  photo         text,
  in_stock      boolean NOT NULL DEFAULT true,
  bestseller    boolean NOT NULL DEFAULT false,
  sort          int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS menu_items_rest_idx ON menu_items (restaurant_id);

CREATE TABLE IF NOT EXISTS addresses (
  id       serial PRIMARY KEY,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label    text NOT NULL DEFAULT 'Home',
  landmark text NOT NULL,                           -- "Green gate behind Jamia Masjid": most homes have no number
  lat      double precision NOT NULL,
  lon      double precision NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS order_no START 1001;
-- Status flow: placed → accepted (UPI: waiting for payment) → pay_claimed → confirmed → preparing → out → delivered
--              or rejected / expired / cancelled. Cash orders go placed → confirmed on accept.
CREATE TABLE IF NOT EXISTS orders (
  id             text PRIMARY KEY,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  restaurant_id  text NOT NULL REFERENCES restaurants(id),
  status         text NOT NULL,
  pay_method     text NOT NULL CHECK (pay_method IN ('upi', 'cod')),
  items          jsonb NOT NULL,
  item_total     int NOT NULL,
  delivery_fee   int NOT NULL,
  packing        int NOT NULL,
  total          int NOT NULL,
  km             numeric NOT NULL,
  commission_pct numeric NOT NULL,
  commission     int NOT NULL,                      -- platform fee on food value, owed by the restaurant once delivered
  address        jsonb NOT NULL,
  customer_phone text,
  customer_name  text,
  note           text,
  utr            text,
  pay_issue      boolean NOT NULL DEFAULT false, -- restaurant said the payment hasn't arrived
  reject_reason  text,
  cancel_by      text,
  cancel_reason  text,
  refund         text CHECK (refund IN ('due', 'sent', 'received')),
  rider_phone    text,
  rider_name     text,
  rider_lat      double precision,
  rider_lon      double precision,
  rider_at       timestamptz,
  rating         int,
  review         text,
  settlement_id  int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  accept_by      timestamptz,
  accepted_at    timestamptz,
  pay_by         timestamptz,
  pay_claimed_at timestamptz,
  confirmed_at   timestamptz,
  cancel_until   timestamptz,
  preparing_at   timestamptz,
  out_at         timestamptz,
  delivered_at   timestamptz,
  closed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_rest_idx ON orders (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_open_idx ON orders (status) WHERE status IN ('placed', 'accepted', 'pay_claimed');

-- Commission statements: the restaurant pays the platform by UPI and enters the reference; admin confirms.
CREATE TABLE IF NOT EXISTS settlements (
  id            serial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id),
  orders        int NOT NULL,
  food_total    int NOT NULL,
  amount        int NOT NULL,
  status        text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'paid', 'rejected')),
  utr           text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);

CREATE TABLE IF NOT EXISTS banners (
  id            serial PRIMARY KEY,
  kicker        text,                               -- small line above, e.g. "WAZWAN NIGHTS"
  title         text NOT NULL,
  subtitle      text,
  photo         text,
  restaurant_id text REFERENCES restaurants(id) ON DELETE CASCADE,
  active        boolean NOT NULL DEFAULT true,
  sort          int NOT NULL DEFAULT 0
);
