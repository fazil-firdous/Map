-- Shop rows now carry their newest approved photo, so lists can show real pictures.
CREATE INDEX IF NOT EXISTS photos_shop_idx ON photos (shop_id, created_at DESC) WHERE status = 'approved';
