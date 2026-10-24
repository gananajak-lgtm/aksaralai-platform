import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConsentSubmission,verifyConsentOrigin} from '../src/oauth-consent-submit.js';
const nonce='A'.repeat(43);
test('consent requires explicit decision and a valid one-time nonce',()=>{
 assert.deepEqual(validateConsentSubmission({decision:'approve',nonce}),{ok:true,decision:'approve',nonce});
 assert.deepEqual(validateConsentSubmission({decision:'deny',nonce}),{ok:true,decision:'deny',nonce});
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
