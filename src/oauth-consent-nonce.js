// One-time consent challenge primitives. The database stores only a SHA-256 hash.
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function hashConsentNonce(nonce) {
 if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(nonce))throw new TypeError('Invalid consent nonce');
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(nonce))));
}
export function generateConsentNonce() {
 const bytes=new Uint8Array(32);
 crypto.getRandomValues(bytes);
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function consumeConsentNonce(db,{nonce,userId,now}) {
 if(!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(now))throw new TypeError('Invalid consent context');
 const digest=await hashConsentNonce(nonce);
 const result=await db.prepare('UPDATE oauth_consent_nonces SET consumed_at=? WHERE nonce_hash=? AND user_id=? AND consumed_at IS NULL AND expires_at>?').bind(now,digest,userId,now).run();
 return result.meta?.changes===1;
}
