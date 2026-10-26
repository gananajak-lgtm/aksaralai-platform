// Explicit consent response validation, isolated from token/code issuance.
export function validateConsentSubmission(body) {
 if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'invalid_request'};
 const required=['decision','nonce','response_type','client_id','redirect_uri','code_challenge','code_challenge_method','scope','state'];
 const keys=Object.keys(body);
 if(keys.length!==required.length||keys.some(k=>!required.includes(k)))return {ok:false,error:'invalid_request'};
 if(required.slice(2).some(k=>typeof body[k]!=='string'))return {ok:false,error:'invalid_request'};
 if(body.decision!=='approve'&&body.decision!=='deny')return {ok:false,error:'invalid_decision'};
 if(typeof body.nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.nonce))return {ok:false,error:'invalid_nonce'};
 return {ok:true,decision:body.decision,nonce:body.nonce,params:Object.fromEntries(required.slice(2).map(k=>[k,body[k]]))};
}
export function verifyConsentOrigin(request) {
 const url=new URL(request.url);
 const origin=request.headers.get('origin');
 // Reject missing Origin as well as cross-site submissions.
 if(!origin||origin!==url.origin)return false;
 if(request.headers.get('sec-fetch-site')==='cross-site')return false;
 return true;
}
