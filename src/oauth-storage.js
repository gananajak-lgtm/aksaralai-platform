// One-time authorization code redemption primitives. Caller must authenticate
// the client, validate redirect_uri and PKCE, and issue a token separately.
export async function consumeAuthorizationCode(db,codeHash,clientId,now) {
 if(typeof codeHash!=='string'||!/^[a-f0-9]{64}$/.test(codeHash)||typeof clientId!=='string'||!Number.isSafeInteger(now))throw new TypeError('Invalid code redemption');
 // Atomic compare-and-set prevents concurrent redemption and replay.
 const changed=await db.prepare(
  'UPDATE oauth_authorization_codes SET consumed_at=? WHERE code_hash=? AND client_id=? AND consumed_at IS NULL AND expires_at>?'
 ).bind(now,codeHash,clientId,now).run();
 if(changed.meta?.changes!==1)return null;
 return db.prepare('SELECT user_id,client_id,redirect_uri,code_challenge,scope FROM oauth_authorization_codes WHERE code_hash=? AND consumed_at=?').bind(codeHash,now).first();
}
export async function lookupAccessToken(db,tokenHash,now) {
 if(typeof tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(tokenHash)||!Number.isSafeInteger(now))return null;
 return db.prepare("SELECT user_id,client_id,scope FROM oauth_access_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>? AND scope='novels:read'").bind(tokenHash,now).first();
}
export async function revokeAccessToken(db,tokenHash,userId,now) {
 if(typeof tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(tokenHash)||!Number.isSafeInteger(userId)||!Number.isSafeInteger(now))throw new TypeError('Invalid revocation');
 const outcome=await db.prepare('UPDATE oauth_access_tokens SET revoked_at=? WHERE token_hash=? AND user_id=? AND revoked_at IS NULL').bind(now,tokenHash,userId).run();
 return outcome.meta?.changes===1;
}
