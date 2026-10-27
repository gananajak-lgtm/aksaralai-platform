import {prepareOAuthConsent} from './oauth-consent.js';
import {verifyAndConsumeConsent} from './oauth-consent-verification.js';
import {validateConsentSubmission,verifyConsentOrigin} from './oauth-consent-submit.js';
import {buildConsentDecisionRedirect} from './oauth-consent-decision.js';

// Denial-only until issuance and token exchange are implemented.
// Authentication and feature gates are enforced by the caller.
export async function handleOAuthConsentDenial(db,request,{writerId,sessionTokenHash,now}){
 if(!verifyConsentOrigin(request))return new Response('Forbidden origin',{status:403});
 const type=request.headers.get('content-type')||'';
 if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(type))return new Response('Unsupported media type',{status:415});
 const body=await request.text();
 if(new TextEncoder().encode(body).length>8192)return new Response('Form too large',{status:413});
 const form=new URLSearchParams(body);
 const entries=[...form.entries()];
 if(entries.length!==new Set(entries.map(([key])=>key)).size)return new Response('Duplicate form field',{status:400});
 const submission=validateConsentSubmission(Object.fromEntries(entries));
 if(!submission.ok)return new Response('Invalid consent form',{status:400});
 const approved=await prepareOAuthConsent(db,submission.params);
 if(!approved.ok)return new Response('Invalid OAuth authorization request',{status:400});
 // Never consume an approval nonce until the code-issuance path exists.
 if(submission.decision!=='deny')return new Response('Authorization code issuance not enabled',{status:503});
 const checked=await verifyAndConsumeConsent(db,{request,body:Object.fromEntries(entries),approved,userId:writerId,sessionTokenHash,now});
 if(!checked.ok)return new Response('Invalid or expired consent',{status:403});
 return new Response(null,{status:303,headers:{location:buildConsentDecisionRedirect(approved,'deny'),'cache-control':'no-store','referrer-policy':'no-referrer'}});
}
