-- One-time, user-bound consent nonces for future explicit OAuth approval.
-- Never store the raw browser nonce. A successful consume must be atomic.
CREATE TABLE IF NOT EXISTS oauth_consent_nonces (
 nonce_hash TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL,
 consumed_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_consent_nonces_user ON oauth_consent_nonces(user_id,expires_at);
