import {lookupAccessToken} from './oauth-storage.js';

const utf8=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function hashOAuthSecret(secret) {
 if(typeof secret!=='string'||!secret||secret.length>512)throw new TypeError('Invalid OAuth secret');
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(secret))));
}
export function parseBearerAuthorization(header) {
 if(typeof header!=='string'||header.length>1024)return null;
 const match=/^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(header);
 return match?match[1]:null;
}
// Resolves only active, read-only grants. Never falls back to ambient cookies.
export async function authenticateOAuthBearer(db,header,now) {
 const token=parseBearerAuthorization(header);
 if(!token||!Number.isSafeInteger(now))return null;
 const grant=await lookupAccessToken(db,await hashOAuthSecret(token),now);
 if(!grant||grant.scope!=='novels:read')return null;
 return grant;
}
