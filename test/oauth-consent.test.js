import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOAuthConsent} from '../src/oauth-consent.js';

function database(record) {
 return {prepare(sql) {
  assert.match(sql,/FROM oauth_clients WHERE client_id=/);
  return {bind(id) {
   assert.equal(id,'chatgpt');
   return {first:async()=>record};
  }};
 }};
}
const params={client_id:'chatgpt',response_type:'code',redirect_uri:'https://example.com/callback',code_challenge:'A'.repeat(43),code_challenge_method:'S256',scope:'novels:read',state:'x'.repeat(20)};
test('OAuth consent accepts only registered redirect URI',async()=>{
 const db=database({client_id:'chatgpt',display_name:'ChatGPT',redirect_uris_json:'["https://example.com/callback"]'});
 const result=await prepareOAuthConsent(db,params);
 assert.equal(result.ok,true);
 assert.equal(result.display_name,'ChatGPT');
 assert.equal((await prepareOAuthConsent(db,{...params,redirect_uri:'https://evil.example/callback'})).ok,false);
});
test('OAuth consent denies unregistered and malformed clients',async()=>{
 assert.deepEqual(await prepareOAuthConsent(database(null),params),{ok:false,error:'invalid_client'});
 assert.equal((await prepareOAuthConsent(database({client_id:'chatgpt',display_name:'X',redirect_uris_json:'not-json'}),params)).ok,false);
});
test('OAuth consent rejects invalid scope and missing state',async()=>{
 const db=database({client_id:'chatgpt',display_name:'ChatGPT',redirect_uris_json:'["https://example.com/callback"]'});
 assert.equal((await prepareOAuthConsent(db,{...params,scope:'novels:write'})).ok,false);
 assert.equal((await prepareOAuthConsent(db,{...params,state:''})).ok,false);
});
