// Canonical OAuth request binding prevents nonce reuse with different clients,
// callbacks, PKCE challenges, state or signed-in writer sessions.
const utf8=new TextEncoder();
const toHex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export async function hashConsentContext(approved,userId,sessionTokenHash) {
 if(!approved?.ok||!Number.isSafeInteger(userId)||userId<1||
    typeof sessionTokenHash!=='string'||!/^[a-f0-9]{64}$/.test(sessionTokenHash))throw new TypeError('Invalid consent context');
 const fields=['client_id','redirect_uri','code_challenge','scope','state'];
 if(fields.some(k=>typeof approved[k]!=='string'||!approved[k]))throw new TypeError('Incomplete authorization request');
 const canonical=JSON.stringify([userId,sessionTokenHash,...fields.map(k=>approved[k])]);
 return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(canonical))));
}
export async function storeBoundConsent(db,{nonceHash,contextHash,userId,expiresAt,now}) {
 if(!/^[a-f0-9]{64}$/.test(nonceHash)||!/^[a-f0-9]{64}$/.test(contextHash)||
    !Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(expiresAt)||
    !Number.isSafeInteger(now)||expiresAt<=now)throw new TypeError('Invalid consent binding');
 return db.prepare('INSERT INTO oauth_consent_nonces(nonce_hash,context_hash,user_id,expires_at,created_at) VALUES(?,?,?,?,?)')
  .bind(nonceHash,contextHash,userId,expiresAt,now).run();
}
export async function consumeBoundConsent(db,{nonceHash,contextHash,userId,now}) {
 if(!/^[a-f0-9]{64}$/.test(nonceHash)||!/^[a-f0-9]{64}$/.test(contextHash)||
    !Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(now))throw new TypeError('Invalid consent binding');
 const result=await db.prepare('UPDATE oauth_consent_nonces SET consumed_at=? WHERE nonce_hash=? AND context_hash=? AND user_id=? AND consumed_at IS NULL AND expires_at>?')
  .bind(now,nonceHash,contextHash,userId,now).run();
 return result.meta?.changes===1;
}
