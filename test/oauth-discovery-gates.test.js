import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const paths=[
 '/.well-known/oauth-authorization-server',
 '/.well-known/oauth-authorization-server/api/mcp',
 '/.well-known/oauth-protected-resource',
 '/.well-known/oauth-protected-resource/api/mcp'
];
const enabled={
 AKSARALAI_OAUTH_PREVIEW_ENABLED:'true',
 AKSARALAI_OAUTH_CONSENT_FORM_ENABLED:'true',
 AKSARALAI_OAUTH_ISSUANCE_ENABLED:'true',
 AKSARALAI_OAUTH_TOKEN_ENABLED:'true',
 AKSARALAI_MCP_ENABLED:'true'
};
test('OAuth/MCP discovery fails closed unless every rollout gate is enabled',async()=>{
 for(const path of paths){
  const request=new Request('https://aksaralai.example'+path);
  const off=await worker.fetch(request,{DB:{}});
  assert.equal(off.status,503,path);
  for(const key of Object.keys(enabled)){
   const partial={...enabled};delete partial[key];
   assert.equal((await worker.fetch(request,{DB:{},...partial})).status,503,path+' missing '+key);
  }
  const on=await worker.fetch(request,{DB:{},...enabled});
  assert.equal(on.status,200,path);
  const body=await on.json();
  assert.ok(body.issuer||body.resource);
 }
});
