import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthMetadata,protectedResourceMetadata} from '../src/oauth-metadata.js';
test('OAuth metadata publishes only PKCE read-only authorization-code grant',async()=>{
 const response=oauthMetadata(new Request('https://aksaralai.example/.well-known/oauth-authorization-server'));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.issuer,'https://aksaralai.example');
 assert.equal(body.authorization_endpoint,'https://aksaralai.example/api/oauth/authorize');
 assert.equal(body.token_endpoint,'https://aksaralai.example/api/oauth/token');
 assert.deepEqual(body.scopes_supported,['novels:read']);
 assert.deepEqual(body.grant_types_supported,['authorization_code']);
 assert.deepEqual(body.code_challenge_methods_supported,['S256']);
 assert.deepEqual(body.token_endpoint_auth_methods_supported,['none']);
 assert.equal(body.registration_endpoint,undefined);
});
test('protected resource metadata identifies MCP and read scope',async()=>{
 const response=protectedResourceMetadata(new Request('https://aksaralai.example/.well-known/oauth-protected-resource/api/mcp'));
 const body=await response.json();
 assert.equal(body.resource,'https://aksaralai.example/api/mcp');
 assert.deepEqual(body.authorization_servers,['https://aksaralai.example']);
 assert.deepEqual(body.scopes_supported,['novels:read']);
});
test('metadata refuses nonlocal plain HTTP',()=>{
 assert.equal(oauthMetadata(new Request('http://aksaralai.example/.well-known/oauth-authorization-server')).status,400);
});
