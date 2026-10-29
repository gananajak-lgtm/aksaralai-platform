import {hashOAuthSecret} from './oauth-bearer.js';

// Issue only after authenticated writer approval and atomic one-time nonce consumption.
// A failed INSERT burns the consent nonce; it must never yield an unpersisted grant.
export async function issueAuthorizationCode(db,{approved,userId,now,generateSecret}){
 if(!approved?.ok||!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(now)||
    !Number.isSafeInteger(now+300)||typeof generateSecret!=='function')throw new TypeError('Invalid code issuance context');
 for(const key of ['client_id','redirect_uri','code_challenge']){
  if(typeof approved[key]!=='string'||!approved[key])throw new TypeError('Incomplete authorization request');
 }
 if(approved.scope!=='novels:read')throw new TypeError('Invalid scope');
 const code=generateSecret();
 if(typeof code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(code))throw new TypeError('Invalid authorization code');
 const codeHash=await hashOAuthSecret(code);
 const result=await db.prepare(
  'INSERT INTO oauth_authorization_codes(code_hash,client_id,user_id,redirect_uri,code_challenge,scope,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)'
 ).bind(codeHash,approved.client_id,userId,approved.redirect_uri,approved.code_challenge,'novels:read',now+300,now).run();
 if(result.meta?.changes!==1)throw new Error('Authorization code was not stored');
 return code;
}
