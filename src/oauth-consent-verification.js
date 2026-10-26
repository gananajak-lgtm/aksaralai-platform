import {hashConsentNonce} from './oauth-consent-nonce.js';
import {hashConsentContext,consumeBoundConsent} from './oauth-consent-binding.js';
import {validateConsentSubmission,verifyConsentOrigin} from './oauth-consent-submit.js';

// Authorize a consent *decision* only. This does not issue a code or token.
// The caller must revalidate the registered OAuth client and authenticated writer.
export async function verifyAndConsumeConsent(db,{request,body,approved,userId,sessionTokenHash,now}) {
 if(!verifyConsentOrigin(request))return {ok:false,error:'invalid_origin'};
 const submitted=validateConsentSubmission(body);
 if(!submitted.ok)return submitted;
 if(!approved?.ok||!Number.isSafeInteger(userId)||userId<1||
    !Number.isSafeInteger(now))return {ok:false,error:'invalid_context'};
 const fields=['client_id','redirect_uri','code_challenge','scope','state'];
 if(submitted.params.response_type!=='code'||submitted.params.code_challenge_method!=='S256'||fields.some(k=>submitted.params[k]!==approved[k]))return {ok:false,error:'mismatched_request'};
 const nonceHash=await hashConsentNonce(submitted.nonce);
 const contextHash=await hashConsentContext(approved,userId,sessionTokenHash);
 const consumed=await consumeBoundConsent(db,{nonceHash,contextHash,userId,now});
 if(!consumed)return {ok:false,error:'expired_or_used_consent'};
 return {ok:true,decision:submitted.decision};
}
