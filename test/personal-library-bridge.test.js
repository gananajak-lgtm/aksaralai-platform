import test from 'node:test';
import assert from 'node:assert/strict';
import {personalLibraryBridge} from '../src/personal-library-bridge.js';
const db={prepare(sql){return {bind(...args){return {
 async first(){
  if(sql.includes('FROM novels WHERE id=?'))return args[0]===1?{id:1}:null;
  if(sql.includes('FROM chapters WHERE id=?'))return args[0]===2?{id:2,novel_id:1,title:'ตอนที่ 1',position:1,body:'ต้นฉบับ'}:null;
  if(sql.includes('FROM users WHERE id=?'))return {id:7};
  throw Error('Unexpected SQL '+sql);
 },
 async all(){
  if(sql.includes('FROM novels ORDER'))return {results:[{id:1,title:'นิยายตัวอย่าง'}]};
  if(sql.includes('FROM chapters WHERE novel_id=?'))return {results:[{id:2,title:'ตอนที่ 1',position:1}]};
  throw Error('Unexpected SQL '+sql);
 }
 };}}}};
const get=path=>new Request('https://example.test'+path);
test('library is disabled by default',async()=>{
 const res=await personalLibraryBridge(get('/api/library/novels'),{DB:db});
 assert.equal(res.status,503);
});
test('opt-in public library lists novels and reads a chapter',async()=>{
 const env={DB:db,AKSARALAI_PUBLIC_LIBRARY_ENABLED:'true'};
 assert.equal((await personalLibraryBridge(get('/api/library/novels'),env)).status,200);
 assert.equal((await personalLibraryBridge(get('/api/library/novels/1/chapters'),env)).status,200);
 const res=await personalLibraryBridge(get('/api/library/chapters/2'),env);
 assert.equal((await res.json()).chapter.body,'ต้นฉบับ');
});
test('edit cannot run without separate write flag and strong bearer secret',async()=>{
 const base={DB:db,AKSARALAI_PUBLIC_LIBRARY_ENABLED:'true'};
 const req=()=>new Request('https://example.test/api/library/edit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'apply',chapter_id:2,new_body:'เปลี่ยน',confirm:true})});
 assert.equal((await personalLibraryBridge(req(),base)).status,503);
 assert.equal((await personalLibraryBridge(req(),{...base,AKSARALAI_LIBRARY_WRITE_ENABLED:'true',AKSARALAI_LIBRARY_WRITE_KEY:'a'.repeat(40)})).status,401);
});
