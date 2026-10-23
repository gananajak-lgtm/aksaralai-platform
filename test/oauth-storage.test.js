import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {redeemAuthorizationCode,lookupAccessToken,revokeAccessToken} from '../src/oauth-storage.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const verifier='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const challenge='E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const hash='a'.repeat(64);
function fakeDB(){
 const state={consumed:false,revoked:false,updates:0};
 const grant={client_id:'client-1',redirect_uri:'https://client.example/cb',code_challenge:challenge,user_id:7,scope:'novels:read'};
 return {state,prepare(sql){
  return {bind(...args){return {
   async first(){
    if(sql.includes('oauth_authorization_codes')){
     if(state.consumed&&!sql.includes('consumed_at=?'))return null;
     if(sql.includes('expires_at')&&args[1]!=='client-1')return null;
     return grant;
    }
    if(sql.includes('oauth_access_tokens'))return state.revoked?null:{user_id:7,client_id:'client-1',scope:'novels:read'};
    return null;
   },
   async run(){
    state.updates++;
    if(sql.includes('oauth_authorization_codes')){
     if(state.consumed)return {meta:{changes:0}};
     state.consumed=true;return {meta:{changes:1}};
    }
    if(sql.includes('oauth_access_tokens')){
     if(state.revoked||args[2]!==7)return {meta:{changes:0}};
     state.revoked=true;return {meta:{changes:1}};
    }
    return {meta:{changes:0}};
   }
  }}};
 }};
}
test('valid PKCE code can only be redeemed once',async()=>{
 const db=fakeDB(),args={codeHash:hash,clientId:'client-1',redirectUri:'https://client.example/cb',verifier,now:100};
 assert.equal((await redeemAuthorizationCode(db,args)).user_id,7);
 assert.equal(await redeemAuthorizationCode(db,args),null);
 assert.equal(db.state.updates,1);
});
test('wrong verifier, client or redirect cannot consume code',async()=>{
 const db=fakeDB(),args={codeHash:hash,clientId:'client-1',redirectUri:'https://client.example/cb',verifier,now:100};
 assert.equal(await redeemAuthorizationCode(db,{...args,verifier:'x'.repeat(43)}),null);
 assert.equal(await redeemAuthorizationCode(db,{...args,redirectUri:'https://attacker.example/cb'}),null);
 assert.equal(await redeemAuthorizationCode(db,{...args,clientId:'wrong'}),null);
 assert.equal(db.state.updates,0);
});
test('access tokens support lookup and revocation',async()=>{
 const db=fakeDB();
 assert.equal((await lookupAccessToken(db,hash,100)).scope,'novels:read');
 assert.equal(await revokeAccessToken(db,hash,7,100),true);
 assert.equal(await revokeAccessToken(db,hash,7,100),false);
 assert.equal(await lookupAccessToken(db,hash,100),null);
});
