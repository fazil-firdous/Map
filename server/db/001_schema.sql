-- Srinagar Bazaar database (PostgreSQL 16 + PostGIS).
-- Every change to a shop bumps its `version`, so phones can download only what changed (offline sync).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS sync_seq;

CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   text UNIQUE,
  name        text,
  phone       text UNIQUE,                 -- set once verified by OTP, E.164 (+91...)
  role        text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'owner', 'admin')),
  points      int  NOT NULL DEFAULT 0,
  banned      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,            -- sha256 of the bearer token; the token itself is never stored
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  phone       text PRIMARY KEY,
  code_hash   text NOT NULL,
  attempts    int  NOT NULL DEFAULT 0,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS areas (
  id    serial PRIMARY KEY,
  name  text UNIQUE NOT NULL,
  geom  geography(Point, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS sights (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  kind  text NOT NULL,
  fame  int  NOT NULL DEFAULT 0,
  geom  geography(Point, 4326) NOT NULL
);

-- Categories get permanent numeric ids so phones can keep using them across syncs (append-only).
CREATE TABLE IF NOT EXISTS taxonomy_groups (
  id    serial PRIMARY KEY,
  name  text UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS taxonomy (
  id        serial PRIMARY KEY,
  category  text UNIQUE NOT NULL,
  grp_id    int NOT NULL REFERENCES taxonomy_groups(id)
);

CREATE TABLE IF NOT EXISTS shops (
  id               text PRIMARY KEY,                     -- SXR-XXXXXXXX
  name             text NOT NULL,
  grp              text NOT NULL,
  category         text NOT NULL REFERENCES taxonomy(category),
  brand            text,
  phone            text,
  phones_other     text[] NOT NULL DEFAULT '{}',
  phone_is_chain   boolean NOT NULL DEFAULT false,
  whatsapp         text,
  website          text,
  instagram        text,
  facebook         text,
  email            text,
  address          text,
  locality         text,
  pincode          text,
  geom             geography(Point, 4326) NOT NULL,
  location_precise boolean NOT NULL DEFAULT true,
  opening_hours    text,
  sources          text[] NOT NULL DEFAULT '{}',
  source_ids       text[] NOT NULL DEFAULT '{}',
  quality_score    int NOT NULL DEFAULT 50,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'closed', 'rejected')),
  verified         boolean NOT NULL DEFAULT false,       -- confirmed by the owner or by 2 visitors
  owner_id         uuid REFERENCES users(id),
  created_by       uuid REFERENCES users(id),
  live_status      text CHECK (live_status IN ('open', 'closed_today', 'opens_late', 'busy')),
  live_note        text,
  live_until       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          bigint NOT NULL DEFAULT nextval('sync_seq')
);
CREATE INDEX IF NOT EXISTS shops_geom_idx    ON shops USING gist (geom);
CREATE INDEX IF NOT EXISTS shops_version_idx ON shops (version);
CREATE INDEX IF NOT EXISTS shops_name_trgm   ON shops USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS shops_owner_idx   ON shops (owner_id);

CREATE OR REPLACE FUNCTION bump_version() RETURNS trigger AS $$
BEGIN NEW.version := nextval('sync_seq'); NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS shops_bump ON shops;
CREATE TRIGGER shops_bump BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION bump_version();

-- Shop visits, calls, WhatsApp and direction taps: counted per day, shown only to the owner.
CREATE TABLE IF NOT EXISTS shop_stats (
  shop_id  text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day      date NOT NULL,
  kind     text NOT NULL CHECK (kind IN ('view', 'call', 'whatsapp', 'directions', 'share', 'search_hit')),
  n        int  NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, day, kind)
);

CREATE TABLE IF NOT EXISTS claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone       text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Suggested edits, reports and new-shop submissions from users: wait for review.
CREATE TABLE IF NOT EXISTS edits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('edit', 'closed', 'confirm', 'new')),
  field       text,
  value       text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS edits_pending_idx ON edits (status, created_at);

-- Owner-only content (free for now, paid later): deals, bazaar rates, product catalogue, photos.
CREATE TABLE IF NOT EXISTS deals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title      text NOT NULL,
  details    text,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_live_idx ON deals (ends_at);

CREATE TABLE IF NOT EXISTS prices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  item       text NOT NULL,
  price      text NOT NULL,                 -- free text: "₹600 per hour", "₹250 / kg"
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name       text NOT NULL,
  brand      text,
  price      text,
  in_stock   boolean NOT NULL DEFAULT true,
  tags       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  search     tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(tags, ''))) STORED
);
CREATE INDEX IF NOT EXISTS products_search_idx ON products USING gin (search);
CREATE INDEX IF NOT EXISTS products_trgm_idx   ON products USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  file       text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ask the bazaar
CREATE TABLE IF NOT EXISTS asks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       text NOT NULL,
  category   text,
  geom       geography(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours'
);
CREATE TABLE IF NOT EXISTS ask_targets (
  ask_id   uuid NOT NULL REFERENCES asks(id) ON DELETE CASCADE,
  shop_id  text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  seen_at  timestamptz,
  PRIMARY KEY (ask_id, shop_id)
);
CREATE TABLE IF NOT EXISTS ask_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ask_id     uuid NOT NULL REFERENCES asks(id) ON DELETE CASCADE,
  shop_id    text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bazaar champions: every point has a reason, so the leaderboard can be audited.
CREATE TABLE IF NOT EXISTS points_ledger (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta      int  NOT NULL,
  reason     text NOT NULL,
  ref        text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS points_month_idx ON points_ledger (created_at);
