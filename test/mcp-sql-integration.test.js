import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './helpers/sqlite-d1.js';
import {hashOAuthSecret} from '../src/oauth-bearer.js';
test('MCP reads the owned first chapter through actual SQL and keeps other novels private',async()=>{
 const db=fixture(),token='T'.repeat(43);
 db.sql.prepare('INSERT INTO oauth_clients VALUES(?,?,?,?)').run('test','Test client','["https://example.test/callback"]',1);
 db.sql.prepare('INSERT INTO oauth_access_tokens(token_hash,client_id,user_id,scope,expires_at,created_at) VALUES(?,?,?,?,?,?)').run(await hashOAuthSecret(token),'test',3,'novels:read',Math.floor(Date.now()/1000)+3600,1);
 const call=(name,args)=>worker.fetch(new Request('https://aksaralai.example/api/mcp',{
  method:'POST',headers:{authorization:'Bearer '+token,accept:'application/json','content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})
 }),{DB:db,AKSARALAI_MCP_ENABLED:'true'});
 const list=await call('list_novels',{});assert.equal(list.status,200);
 const novels=JSON.parse((await list.json()).result.content[0].text).novels;
 assert.deepEqual(novels.map(n=>n.id),[11]);
 const read=await call('read_chapters',{novel_id:11,start:1,count:1});assert.equal(read.status,200);
 const chapter=JSON.parse((await read.json()).result.content[0].text).chapters[0];
 assert.equal(chapter.id,7);assert.equal(chapter.body,'Original');
 assert.equal((await call('read_chapters',{novel_id:12,start:1,count:1})).status,404);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM chapter_edit_history').get().n,0);
 db.sql.close();
});
