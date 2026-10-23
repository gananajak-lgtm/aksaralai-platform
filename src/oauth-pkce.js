// OAuth 2.1 PKCE primitives for the future Aksaralai authorization server.
// No token issuance, redirect handling, or public OAuth routes are enabled here.
const utf8 = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function validatePkceChallenge(challenge,method) {
 return method==='S256' && typeof challenge==='string' && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}
export function validatePkceVerifier(verifier) {
 return typeof verifier==='string' && verifier.length>=43 && verifier.length<=128 && /^[A-Za-z0-9._~-]+$/.test(verifier);
}
export async function verifyPkce(verifier,challenge) {
 if(!validatePkceVerifier(verifier)||!validatePkceChallenge(challenge,'S256'))return false;
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(verifier)));
 const actual=base64url(digest);
 let mismatch=0;
 for(let i=0;i<43;i++)mismatch|=actual.charCodeAt(i)^challenge.charCodeAt(i);
 return mismatch===0;
}
export function validateRedirectUri(uri,allowlist) {
 if(typeof uri!=='string'||!Array.isArray(allowlist)||!allowlist.includes(uri))return false;
 try {
  const parsed=new URL(uri);
  return !parsed.username&&!parsed.password&&!parsed.hash &&
   (parsed.protocol==='https:'||(parsed.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)));
 } catch {return false;}
}
