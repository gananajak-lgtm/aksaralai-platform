import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {hashOAuthSecret} from '../src/oauth-bearer.js';

const token='T'.repeat(43);
const flags={AKSARALAI_MCP_ENABLED:'true'};
const rpc=(method,params,id=1)=>new Request('https://aksaralai.example/api/mcp',{
 method:'POST',headers:{'content-type':'application/json','accept':'application/json','authorization':'Bearer '+token},
 body:JSON.stringify({jsonrpc:'2.0',id,method,params})
});
function database(hash,{writerId=7,grantUserId=7,role='writer',novelOwner=7,expired=false,revoked=false}={}){
 return {prepare(sql){return {bind(...args){return {async first(){
  if(sql.includes('FROM oauth_access_tokens'))return args[0]===hash&&!expired&&!revoked?{user_id:grantUserId,client_id:'registered',scope:'novels:read'}:null;
  if(sql.includes('FROM users WHERE id=?'))return grantUserId===writerId&&role==='writer'?{id:writerId,role}:null;
  if(sql.includes('FROM novels WHERE id=? AND author_id=?'))return args[0]===12&&args[1]===novelOwner?{id:12,author_id:novelOwner}:null;
  throw Error('Unexpected query: '+sql);
 },async all(){
  if(sql.includes('FROM novels WHERE author_id=?'))return {results:args[0]===novelOwner?[{id:12,title:'Owned novel',summary:'',updated_at:1}]:[]};
  if(sql.includes('FROM chapters WHERE novel_id=?'))return {results:[{id:21,title:'Chapter 1',position:1,body:'Test manuscript'}]};
  throw Error('Unexpected rows: '+sql);
 }};}}}};
}
test('MCP rejects anonymous and cookie-only requests',async()=>{
 const db=database(await hashOAuthSecret(token));
 const bare=rpc('tools/list');
 const req=new Request(bare.url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','cookie':'aksaralai_session=fake'},body:await bare.text()});
 const res=await worker.fetch(req,{DB:db,...flags});
 assert.equal(res.status,401);
 assert.match(res.headers.get('www-authenticate')||'',/oauth-protected-resource/);
});
test('MCP allows registered bearer to list owned novels and read chapters',async()=>{
 const db=database(await hashOAuthSecret(token));
 const list=await worker.fetch(rpc('tools/call',{name:'list_novels',arguments:{}}),{DB:db,...flags});
 assert.equal(list.status,200);
 const payload=await list.json();
 assert.equal(payload.result.isError,false);
 assert.match(payload.result.content[0].text,/Owned novel/);
});
test('expired, revoked, or non-writer grants fail closed',async()=>{
 const hash=await hashOAuthSecret(token);
 for(const settings of [{expired:true},{revoked:true},{role:'reader'}]){
  const response=await worker.fetch(rpc('tools/list'),{DB:database(hash,settings),...flags});
  assert.equal(response.status,401);
 }
});

test('MCP cannot read another writer\'s novel',async()=>{
 const db=database(await hashOAuthSecret(token),{novelOwner:9});
 const response=await worker.fetch(rpc('tools/call',{name:'read_chapters',arguments:{novel_id:12,start:1,count:1}}),{DB:db,...flags});
 assert.equal(response.status,404);
});
test('MCP read_chapters returns owned manuscript only',async()=>{
 const db=database(await hashOAuthSecret(token));
 const response=await worker.fetch(rpc('tools/call',{name:'read_chapters',arguments:{novel_id:12,start:1,count:1}}),{DB:db,...flags});
 assert.equal(response.status,200);
 const body=await response.json();
 assert.match(body.result.content[0].text,/Test manuscript/);
});
