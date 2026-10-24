-- Extend consent nonces with a hash binding to OAuth request and browser session.
ALTER TABLE oauth_consent_nonces ADD COLUMN context_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_oauth_consent_context ON oauth_consent_nonces(context_hash,user_id);
