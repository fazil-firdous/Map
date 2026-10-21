-- Every login SMS sent, for the daily spending limit and per-network limit.
CREATE TABLE IF NOT EXISTS sms_log (
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  ip text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_log_sent ON sms_log (sent_at);
