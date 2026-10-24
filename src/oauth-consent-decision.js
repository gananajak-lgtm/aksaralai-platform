// OAuth authorization response helpers. Call only after registered-client
// redirect URI validation and an explicit authenticated consent decision.
const validCode=code=>typeof code==='string'&&/^[A-Za-z0-9_-]{32,256}$/.test(code);
function checkedTarget(approved){
 if(!approved?.ok||typeof approved.redirect_uri!=='string'||
    typeof approved.state!=='string'||approved.state.length<16||
    approved.state.length>512||!/^[\x21-\x7e]+$/.test(approved.state))
  throw new TypeError('Validated authorization request required');
 const target=new URL(approved.redirect_uri);
 if(target.hash||target.username||target.password||
    !(target.protocol==='https:'||(target.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(target.hostname))))
  throw new TypeError('Unsafe redirect');
 return target;
}
export function buildConsentDecisionRedirect(approved,decision,code){
 const target=checkedTarget(approved);
 // Prevent preexisting callback parameters from overriding OAuth response fields.
 if(target.searchParams.has('code')||target.searchParams.has('error')||
    target.searchParams.has('state'))throw new TypeError('Conflicting callback parameters');
 if(decision==='deny'){
  if(code!==undefined)throw new TypeError('Denied requests cannot carry codes');
  target.searchParams.set('error','access_denied');
 }else if(decision==='approve'&&validCode(code)){
  target.searchParams.set('code',code);
 }else throw new TypeError('Invalid consent decision');
 target.searchParams.set('state',approved.state);
 return target.toString();
}
