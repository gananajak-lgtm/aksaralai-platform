import test from 'node:test';
import assert from 'node:assert/strict';
import {generateConsentNonce,hashConsentNonce,consumeConsentNonce} from '../src/oauth-consent-nonce.js';

test('consent nonce uses 256 bits of randomness and stable digest',async()=>{
 const first=generateConsentNonce(),second=generateConsentNonce();
 assert.match(first,/^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(first,second);
 assert.match(await hashConsentNonce(first),/^[a-f0-9]{64}$/);
 assert.equal(await hashConsentNonce(first),await hashConsentNonce(first));
});
test('consent nonce is consumed atomically with user and expiry binding',async()=>{
 const nonce=generateConsentNonce();
 let argumentsSeen;
 const db={prepare(sql){
  assert.match(sql,/consumed_at IS NULL AND expires_at>\?/);
  return {bind(...values){argumentsSeen=values;return {run:async()=>({meta:{changes:1}})};}};
 }};
 assert.equal(await consumeConsentNonce(db,{nonce,userId:7,now:100}),true);
 assert.equal(argumentsSeen[0],100);
 assert.equal(argumentsSeen[2],7);
 assert.equal(argumentsSeen[3],100);
 assert.equal(argumentsSeen[1],await hashConsentNonce(nonce));
});
test('consent nonce rejects invalid user and malformed nonce',async()=>{
 await assert.rejects(consumeConsentNonce({}, {nonce:'bad',userId:1,now:100}),TypeError);
 await assert.rejects(consumeConsentNonce({}, {nonce:generateConsentNonce(),userId:0,now:100}),TypeError);
});
