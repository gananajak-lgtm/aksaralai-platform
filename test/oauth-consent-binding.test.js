import test from 'node:test';
import assert from 'node:assert/strict';
import {hashConsentContext,storeBoundConsent,consumeBoundConsent} from '../src/oauth-consent-binding.js';
const approved={ok:true,client_id:'client-a',redirect_uri:'https://example.com/cb',code_challenge:'A'.repeat(43),scope:'novels:read',state:'s'.repeat(20)};
const session='a'.repeat(64),nonce='b'.repeat(64);
test('consent context digest binds writer, session and all authorization fields',async()=>{
 const base=await hashConsentContext(approved,7,session);
 assert.match(base,/^[a-f0-9]{64}$/);
 assert.equal(base,await hashConsentContext(approved,7,session));
 for(const key of ['client_id','redirect_uri','code_challenge','scope','state']){
  assert.notEqual(base,await hashConsentContext({...approved,[key]:approved[key]+'x'},7,session));
 }
 assert.notEqual(base,await hashConsentContext(approved,8,session));
 assert.notEqual(base,await hashConsentContext(approved,7,'c'.repeat(64)));
});
test('bound consent insert and atomic consume constrain request context',async()=>{
 const seen=[];
 const db={prepare(sql){seen.push(sql);return {bind(...args){seen.push(args);return {run:async()=>({meta:{changes:1}})};}};}};
 const contextHash=await hashConsentContext(approved,7,session);
 await storeBoundConsent(db,{nonceHash:nonce,contextHash,userId:7,expiresAt:160,now:100});
 assert.equal(await consumeBoundConsent(db,{nonceHash:nonce,contextHash,userId:7,now:110}),true);
 assert.match(seen[0],/INSERT INTO oauth_consent_nonces/);
 assert.match(seen[2],/context_hash=\?/);
 assert.match(seen[2],/consumed_at IS NULL AND expires_at>\?/);
});
test('bound consent rejects missing request or invalid hashes',async()=>{
 await assert.rejects(hashConsentContext({...approved,state:''},7,session),TypeError);
 await assert.rejects(consumeBoundConsent({}, {nonceHash:'x',contextHash:nonce,userId:7,now:100}),TypeError);
});
