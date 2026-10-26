import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConsentSubmission,verifyConsentOrigin} from '../src/oauth-consent-submit.js';
const nonce='A'.repeat(43);
const params={response_type:'code',client_id:'client',redirect_uri:'https://client.example/cb',code_challenge:'A'.repeat(43),code_challenge_method:'S256',scope:'novels:read',state:'s'.repeat(20)};
test('consent requires explicit decision and a valid one-time nonce',()=>{
 assert.deepEqual(validateConsentSubmission({...params,decision:'approve',nonce}),{ok:true,decision:'approve',nonce,params});
 assert.deepEqual(validateConsentSubmission({...params,decision:'deny',nonce}),{ok:true,decision:'deny',nonce,params});
 for(const data of [{decision:'approve'}, {decision:'yes',nonce},{decision:'approve',nonce:'bad'}, {decision:'approve',nonce,extra:1},null,[]])
  assert.equal(validateConsentSubmission(data).ok,false);
});
test('consent POST requires exact same-origin Origin header',()=>{
 const request=(origin,site)=>new Request('https://aksaralai.example/api/oauth/consent',{method:'POST',headers:{...(origin?{origin}:{}),...(site?{'sec-fetch-site':site}:{})}});
 assert.equal(verifyConsentOrigin(request('https://aksaralai.example','same-origin')),true);
 assert.equal(verifyConsentOrigin(request(null,'same-origin')),false);
 assert.equal(verifyConsentOrigin(request('https://attacker.example','cross-site')),false);
 assert.equal(verifyConsentOrigin(request('https://aksaralai.example','cross-site')),false);
});
