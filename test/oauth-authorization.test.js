import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAuthorizationRequest,buildAuthorizationRedirect} from '../src/oauth-authorization.js';

const client={client_id:'registered-chat-client',redirect_uris:['https://chat.example/oauth/callback']};
const request={response_type:'code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],code_challenge:'A'.repeat(43),code_challenge_method:'S256',scope:'novels:read',state:'secure-random-state-12345'};
test('valid OAuth authorization request has read-only scope and PKCE',()=>{
 const valid=validateAuthorizationRequest(request,client);
 assert.equal(valid.ok,true);
 const redirect=new URL(buildAuthorizationRedirect(valid,'a'.repeat(43)));
 assert.equal(redirect.searchParams.get('state'),request.state);
 assert.equal(redirect.searchParams.get('code'),'a'.repeat(43));
});
test('reject unregistered redirects and changed clients',()=>{
 assert.equal(validateAuthorizationRequest({...request,redirect_uri:'https://attacker.example/cb'},client).ok,false);
 assert.equal(validateAuthorizationRequest({...request,client_id:'other'},client).ok,false);
});
test('reject broad scopes, missing state, and plain PKCE',()=>{
 assert.equal(validateAuthorizationRequest({...request,scope:'novels:write'},client).ok,false);
 assert.equal(validateAuthorizationRequest({...request,state:'x'},client).ok,false);
 assert.equal(validateAuthorizationRequest({...request,code_challenge_method:'plain'},client).ok,false);
 assert.equal(validateAuthorizationRequest({...request,response_type:'token'},client).ok,false);
});
test('never build authorization redirect from invalid grant',()=>{
 assert.throws(()=>buildAuthorizationRedirect({ok:false},'a'.repeat(43)),TypeError);
 assert.throws(()=>buildAuthorizationRedirect(validateAuthorizationRequest(request,client),'bad'),TypeError);
});
