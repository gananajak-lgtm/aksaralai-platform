import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAndConsumeConsent} from '../src/oauth-consent-verification.js';
import {generateConsentNonce,hashConsentNonce} from '../src/oauth-consent-nonce.js';
import {hashConsentContext} from '../src/oauth-consent-binding.js';
const approved={ok:true,client_id:'client',redirect_uri:'https://client.example/cb',code_challenge:'A'.repeat(43),scope:'novels:read',state:'s'.repeat(20)};
const session='a'.repeat(64);
const request=origin=>new Request('https://aksaralai.example/api/oauth/consent',{method:'POST',headers:origin?{origin}:{}});
test('valid consent decision consumes nonce bound to the exact writer session and request',async()=>{
 const nonce=generateConsentNonce(),context=await hashConsentContext(approved,7,session);
 const digest=await hashConsentNonce(nonce);
 let used=false;
 const db={prepare(sql){
  assert.match(sql,/context_hash=\?/);
  return {bind(now,nonceHash,contextHash,userId,expiry){
   assert.equal(nonceHash,digest);
   assert.equal(contextHash,context);
   assert.equal(userId,7);
   assert.equal(expiry,now);
   return {run:async()=>{const changes=used?0:1;used=true;return {meta:{changes}};}};
  }};
 }};
 const args={request:request('https://aksaralai.example'),body:{decision:'approve',nonce},approved,userId:7,sessionTokenHash:session,now:100,};
 assert.deepEqual(await verifyAndConsumeConsent(db,args),{ok:true,decision:'approve'});
 assert.deepEqual(await verifyAndConsumeConsent(db,args),{ok:false,error:'expired_or_used_consent'});
});
test('invalid origin or malformed body never touches storage',async()=>{
 const db={prepare(){throw Error('Unexpected database access');}};
 const args={request:request(null),body:{decision:'deny',nonce:generateConsentNonce()},approved,userId:7,sessionTokenHash:session,now:100};
 assert.equal((await verifyAndConsumeConsent(db,args)).error,'invalid_origin');
 assert.equal((await verifyAndConsumeConsent(db,{...args,request:request('https://aksaralai.example'),body:{decision:'yes',nonce:generateConsentNonce()}})).ok,false);
});
