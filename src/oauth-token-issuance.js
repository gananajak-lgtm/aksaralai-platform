import {hashOAuthSecret} from './oauth-bearer.js';
import {redeemAuthorizationCode} from './oauth-storage.js';
import {validatePkceVerifier} from './oauth-pkce.js';
import {generateConsentNonce} from './oauth-consent-nonce.js';

// Private implementation helper. Route integration remains separately gated.
export async function redeemReadOnlyGrant(db,grant,now){
 if(!grant||typeof grant.codeHash!=='string'||typeof grant.clientId!=='string'||
    typeof grant.redirectUri!=='string'||!validatePkceVerifier(grant.verifier)||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(now+3600))return null;
 const redeemed=await redeemAuthorizationCode(db,{...grant,now});
 if(!redeemed||redeemed.scope!=='novels:read')return null;
 const token=generateConsentNonce();
 const stored=await db.prepare('INSERT INTO oauth_access_tokens(token_hash,client_id,user_id,scope,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(await hashOAuthSecret(token),redeemed.client_id,redeemed.user_id,'novels:read',now+3600,now).run();
 if(stored.meta?.changes!==1)throw new Error('Access token persistence failed');
 return {access_token:token,token_type:'Bearer',expires_in:3600,scope:'novels:read'};
}
