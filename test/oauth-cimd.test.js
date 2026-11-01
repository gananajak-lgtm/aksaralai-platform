import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/sqlite-d1.js';
import {resolveOAuthClient} from '../src/oauth-client.js';
import {prepareOAuthConsent} from '../src/oauth-consent.js';
import {issueAuthorizationCode} from '../src/oauth-code-issuance.js';
import {handleOAuthToken} from '../src/oauth-token-route.js';
const id='https://chatgpt.com/oauth/test-callback/client.json';
const redirect='https://chatgpt.com/connector/oauth/test-callback';
const verifier='v'.repeat(43);
const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
const metadata={client_id:id,redirect_uris:[redirect],token_endpoint_auth_methods_supported:['none','private_key_jwt'],token_endpoint_auth_method:'private_key_jwt'};
const fetchDoc=async(url,options)=>{assert.equal(url,id);assert.equal(options.redirect,'error');return Response.json(metadata);};
const params={client_id:id,redirect_uri:redirect,response_type:'code',scope:'novels:read',state:'s'.repeat(24),code_challenge:challenge,code_challenge_method:'S256'};
test('CIMD validates real metadata, persists FK client, exchanges PKCE and rejects replay',async()=>{
 const db=fixture();
 const before=db.sql.prepare('SELECT body FROM chapters ORDER BY id').all();
 const approved=await prepareOAuthConsent(db,params,{fetchMetadata:fetchDoc});
 assert.equal(approved.ok,true);
 assert.equal(db.sql.prepare('SELECT client_id FROM oauth_clients').get().client_id,id);
 const code=await issueAuthorizationCode(db,{approved,userId:3,now:100,generateSecret:()=> 'c'.repeat(43)});
 const tokenRequest=fields=>new Request('https://aksaralai.example/api/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:id,redirect_uri:redirect,code,code_verifier:verifier,resource:'https://aksaralai.example/api/mcp',...fields})});
 assert.equal((await handleOAuthToken(db,tokenRequest({resource:'https://evil.example/mcp'}),{now:101,fetchMetadata:fetchDoc})).status,400);
 assert.equal((await handleOAuthToken(db,tokenRequest({code_verifier:'x'.repeat(43)}),{now:101,fetchMetadata:fetchDoc})).status,400);
 const response=await handleOAuthToken(db,tokenRequest(),{now:101,fetchMetadata:fetchDoc});
 assert.equal(response.status,200);assert.equal((await response.json()).scope,'novels:read');
 assert.equal((await handleOAuthToken(db,tokenRequest(),{now:101,fetchMetadata:fetchDoc})).status,400);
 assert.deepEqual(db.sql.prepare('SELECT body FROM chapters ORDER BY id').all(),before);
 db.sql.close();
});
test('CIMD never fetches untrusted URLs and rejects forged callbacks or scopes',async()=>{
 const db=fixture();let calls=0;
 for(const bad of ['https://evil.example/oauth/client.json','https://chatgpt.com.evil.example/oauth/client.json','https://chatgpt.com@evil.example/oauth/client.json','https://chatgpt.com/oauth/client.json?x=1','http://chatgpt.com/oauth/client.json']){
  assert.equal(await resolveOAuthClient(db,bad,{fetchMetadata:async()=>{calls++;throw Error();}}),null);
 }
 assert.equal(calls,0);
 for(const patch of [{redirect_uri:redirect+'/'},{redirect_uri:'https://evil.example/'},{scope:'novels:write'}])assert.equal((await prepareOAuthConsent(db,{...params,...patch},{fetchMetadata:fetchDoc})).ok,false);
 db.sql.close();
});
test('CIMD fails closed on invalid metadata, network failures and oversized documents',async()=>{
 const db=fixture();
 for(const doc of [{...metadata,client_id:'wrong'},{...metadata,redirect_uris:['https://evil.example/cb']},{...metadata,redirect_uris:[redirect+'?code=x']},{...metadata,token_endpoint_auth_methods_supported:['private_key_jwt']},{...metadata,padding:'x'.repeat(17000)}]){
  assert.equal(await resolveOAuthClient(db,id,{fetchMetadata:async()=>Response.json(doc)}),null);
 }
 for(const fetchMetadata of [async()=>{throw Error('timeout');},async()=>new Response('{}',{status:302}),async()=>new Response('{}',{headers:{'content-type':'text/html'}})])assert.equal(await resolveOAuthClient(db,id,{fetchMetadata}),null);
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM oauth_clients').get().n,0);
 db.sql.close();
});
