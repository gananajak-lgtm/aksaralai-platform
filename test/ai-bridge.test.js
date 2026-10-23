import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');

test('MCP requires writer authentication before dispatch',()=>{
 const start=source.indexOf("if(p==='/api/mcp'&&m==='POST')");
 assert.ok(start>0);
 assert.match(source.slice(start,start+160),/await author\(db,req\)/);
});
test('MCP does not advertise mutation tools',()=>{
 const block=source.slice(source.indexOf("if(p==='/api/mcp'&&m==='POST')"),source.indexOf(' // Read-only AI Bridge endpoints.'));
 assert.match(block,/name:'list_novels'/);
 assert.match(block,/name:'list_chapters'/);
 assert.match(block,/name:'read_chapters'/);
 assert.match(block,/name:'search_novel'/);
 assert.doesNotMatch(block,/name:'(?:write|delete|update|publish|replace)[^']*'/);
});
test('MCP chapter tools enforce ownership and bounded reads',()=>{
 const block=source.slice(source.indexOf("if(p==='/api/mcp'&&m==='POST')"),source.indexOf(' // Read-only AI Bridge endpoints.'));
 assert.match(block,/await own\(db,nid,actor\)/);
 assert.match(block,/count>5/);
 assert.match(block,/>100000/);
});
test('MCP initialization rejects unsupported protocol versions',()=>{
 const block=source.slice(source.indexOf("if(p==='/api/mcp'&&m==='POST')"),source.indexOf(' // Read-only AI Bridge endpoints.'));
 assert.match(block,/requested!=='2025-03-26'/);
 assert.match(block,/d\.method==='ping'/);
});

test('MCP negotiates JSON and rejects unsupported accept headers',()=>{
 const block=source.slice(source.indexOf("if(p==='/api/mcp'&&m==='POST')"),source.indexOf(' // Read-only AI Bridge endpoints.'));
 assert.match(block,/headers\.get\('accept'\)/);
 assert.match(block,/failure\(406/);
});

test('MCP JSON-RPC rejects null IDs and identified notifications',()=>{
 const block=source.slice(source.indexOf("if(p==='/api/mcp'&&m==='POST')"),source.indexOf(' // Read-only AI Bridge endpoints.'));
 assert.match(block,/isNotification&&id!==undefined/);
 assert.match(block,/id===undefined\|\|id===null/);
});
