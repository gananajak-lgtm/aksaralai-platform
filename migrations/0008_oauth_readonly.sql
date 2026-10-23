-- Database schema only: OAuth routes and token issuance remain disabled.
-- Never store raw authorization codes or access tokens.
CREATE TABLE IF NOT EXISTS oauth_clients (
 client_id TEXT PRIMARY KEY,
 display_name TEXT NOT NULL,
 redirect_uris_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
 code_hash TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 redirect_uri TEXT NOT NULL,
 code_challenge TEXT NOT NULL,
 scope TEXT NOT NULL CHECK (scope = 'novels:read'),
 expires_at INTEGER NOT NULL,
 consumed_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON oauth_authorization_codes(user_id,expires_at);
CREATE TABLE IF NOT EXISTS oauth_access_tokens (
 token_hash TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 scope TEXT NOT NULL CHECK (scope = 'novels:read'),
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_access_tokens(user_id,expires_at);
