-- The preview endpoint is restricted to one configured admin and at most three attempts per UTC day.
-- Reserve a quota slot before the external API request so concurrent clicks cannot exceed the cap.
CREATE TABLE IF NOT EXISTS tts_preview_usage (
  day_utc TEXT NOT NULL,
  username TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 3),
  PRIMARY KEY (day_utc, username)
);
