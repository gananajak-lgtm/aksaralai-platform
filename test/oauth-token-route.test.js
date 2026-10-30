import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleOAuthToken} from '../src/oauth-token-route.js';
import {hashOAuthSecret} from '../src/oauth-bearer.js';
const crypto=globalThis.crypto??webcrypto;
const b64=bytes=>Buffer.from(bytes).toString('base64url');
const verifier='v'.repeat(43);
const challenge=async()=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
const code='c'.repeat(43);
function fakeDb(pkce){
 const state={used:false,token:null};
 return {state,prepare(sql){return {bind(...args){return {async first(){
  if(sql.includes('FROM oauth_clients'))return {client_id:'client',redirect_uris_json:'["https://client.example/callback"]'};
  if(sql.includes('SELECT client_id,redirect_uri,code_challenge'))return !state.used&&args[0]===await hashOAuthSecret(code)?{client_id:'client',redirect_uri:'https://client.example/callback',code_challenge:pkce}:null;
  if(sql.includes('SELECT user_id,client_id,redirect_uri'))return {user_id:42,client_id:'client',redirect_uri:'https://client.example/callback',code_challenge:pkce,scope:'novels:read'};
  throw new Error('Unexpected SELECT: '+sql);
 },async run(){
  if(sql.includes('UPDATE oauth_authorization_codes')){if(state.used)return {meta:{changes:0}};state.used=true;return {meta:{changes:1}}}
  if(sql.includes('INSERT INTO oauth_access_tokens')){state.token=args;return {meta:{changes:1}}}
  throw new Error('Unexpected write: '+sql);
 }};}}}};
}
const request=(fields)=>new Request('https://aksaralai.example/api/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
const valid={grant_type:'authorization_code',code,client_id:'client',redirect_uri:'https://client.example/callback',code_verifier:verifier};
test('PKCE exchange persists only token hash and rejects code replay',async()=>{
 const db=fakeDb(await challenge());
 const response=await handleOAuthToken(db,request(valid),{now:1000});
 assert.equal(response.status,200);
 const token=await response.json();
 assert.equal(token.token_type,'Bearer');assert.equal(token.expires_in,3600);assert.equal(token.scope,'novels:read');
 assert.equal(db.state.token[0],await hashOAuthSecret(token.access_token));
 assert.deepEqual(db.state.token.slice(1),['client',42,'novels:read',4600,1000]);
 assert.equal((await handleOAuthToken(db,request(valid),{now:1001})).status,400);
});
test('invalid verifier, redirect, duplicate form keys, and unknown client fail closed',async()=>{
 const db=fakeDb(await challenge());
 for(const fields of [{...valid,code_verifier:'x'.repeat(43)},{...valid,redirect_uri:'https://evil.example/'},{...valid,client_id:'wrong'}]){
  const res=await handleOAuthToken(db,request(fields),{now:1000});assert.ok(res.status>=400);assert.equal(db.state.used,false);
 }
 const dup=new Request('https://aksaralai.example/api/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams([...Object.entries(valid),['code','d'.repeat(43)]])});
 assert.equal((await handleOAuthToken(db,dup,{now:1000})).status,400);
});
