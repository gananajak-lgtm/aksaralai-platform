import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOAuthConsentDenial} from '../src/oauth-consent-route.js';
import {generateConsentNonce,hashConsentNonce} from '../src/oauth-consent-nonce.js';
import {hashConsentContext} from '../src/oauth-consent-binding.js';

const approved={ok:true,client_id:'reader-client',display_name:'Reader',redirect_uri:'https://reader.example/callback',code_challenge:'A'.repeat(43),scope:'novels:read',state:'s'.repeat(20)};
const params={response_type:'code',client_id:approved.client_id,redirect_uri:approved.redirect_uri,code_challenge:approved.code_challenge,code_challenge_method:'S256',scope:approved.scope,state:approved.state};
const sessionHash='a'.repeat(64);
const request=(decision,nonce)=>new Request('https://aksaralai.example/api/oauth/consent',{method:'POST',headers:{origin:'https://aksaralai.example','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,decision,nonce}).toString()});

test('valid denial redirects with access_denied and original state; nonce cannot be replayed',async()=>{
 const nonce=generateConsentNonce(),digest=await hashConsentNonce(nonce),context=await hashConsentContext(approved,7,sessionHash);
 let consumed=false;
 const db={prepare(sql){
  if(sql.includes('FROM oauth_clients'))return {bind(){return {first:async()=>({client_id:approved.client_id,display_name:approved.display_name,redirect_uris_json:JSON.stringify([approved.redirect_uri])})}}};
  if(sql.includes('UPDATE oauth_consent_nonces'))return {bind(now,hash,ctx,id,expiry){assert.equal(hash,digest);assert.equal(ctx,context);assert.equal(id,7);assert.equal(now,expiry);return {run:async()=>{if(consumed)return {meta:{changes:0}};consumed=true;return {meta:{changes:1}}}}}};
  throw Error('Unexpected query: '+sql);
 }};
 const opts={writerId:7,sessionTokenHash:sessionHash,now:100};
 const first=await handleOAuthConsentDenial(db,request('deny',nonce),opts);
 assert.equal(first.status,303);
 const redirect=new URL(first.headers.get('location'));
 assert.equal(redirect.searchParams.get('error'),'access_denied');
 assert.equal(redirect.searchParams.get('state'),approved.state);
 assert.equal(redirect.searchParams.get('code'),null);
 const replay=await handleOAuthConsentDenial(db,request('deny',nonce),opts);
 assert.equal(replay.status,403);
});

test('approval fails closed without consuming a nonce',async()=>{
 const nonce=generateConsentNonce();
 const db={prepare(sql){
  if(sql.includes('FROM oauth_clients'))return {bind(){return {first:async()=>({client_id:approved.client_id,display_name:approved.display_name,redirect_uris_json:JSON.stringify([approved.redirect_uri])})}}};
  throw Error('Approval must not access nonce storage');
 }};
 const result=await handleOAuthConsentDenial(db,request('approve',nonce),{writerId:7,sessionTokenHash:sessionHash,now:100});
 assert.equal(result.status,503);
});
