import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMcpWriter} from '../src/mcp-auth.js';

test('MCP denies missing or invalid bearer grants without querying users',async()=>{
 let queries=0;
 const db={prepare(){queries++;throw Error('unexpected query');}};
 const request={headers:new Headers({cookie:'aksaralai_session=example'})};
 assert.equal(await resolveMcpWriter(db,request,100,async()=>null),null);
 assert.equal(queries,0);
});
test('MCP resolves writer from an explicit read-only grant',async()=>{
 const db={prepare(sql){assert.match(sql,/role='writer'/);return {bind(id){assert.equal(id,8);return {first:async()=>({id:8,role:'writer'})};}};}};
 const request={headers:new Headers({authorization:'Bearer '+ 'A'.repeat(43)})};
 const user=await resolveMcpWriter(db,request,100,async(_db,header)=>{assert.equal(header,request.headers.get('authorization'));return {user_id:8,scope:'novels:read'};});
 assert.equal(user.id,8);
});
test('MCP denies grants without read scope',async()=>{
 const request={headers:new Headers()};
 const db={prepare(){throw Error('unexpected query');}};
 assert.equal(await resolveMcpWriter(db,request,100,async()=>({user_id:8,scope:'novels:write'})),null);
});
