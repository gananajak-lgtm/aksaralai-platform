import test from 'node:test';
import assert from 'node:assert/strict';
import {previewChapterEdit,applyChapterEdit,undoChapterEdit} from '../src/mcp-chapter-edit.js';

function fixture(ownerId=7){
 let writes=0;
 const db={
  prepare(sql){
   return {bind(...args){return {
    async first(){
     if(sql.includes('FROM chapters c JOIN novels n'))return ownerId===args[1]
      ?{id:2,novel_id:1,title:'ตอนทดสอบ',body:'ต้นฉบับ'}:null;
     if(sql.includes('FROM chapter_edit_history h'))return null;
     throw new Error('Unexpected SQL: '+sql);
    }
   };}};
  },
  async batch(){writes++;throw new Error('No write should be reached');}
 };
 return {db,get writes(){return writes;}};
}
test('preview returns a fingerprint without writing to D1',async()=>{
 const f=fixture();
 const result=await previewChapterEdit(f.db,{writerId:7,chapterId:2,newBody:'ข้อความใหม่'});
 assert.equal(result.ok,true);
 assert.equal(result.changed,true);
 assert.match(result.fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(f.writes,0);
});
test('preview refuses another writer chapter',async()=>{
 const f=fixture(8);
 const result=await previewChapterEdit(f.db,{writerId:7,chapterId:2,newBody:'ข้อความใหม่'});
 assert.deepEqual(result,{ok:false,error:'not_found'});
 assert.equal(f.writes,0);
});
test('apply requires explicit confirmation and valid fingerprint',async()=>{
 const f=fixture();
 for(const confirm of [undefined,false,'true']){
  const result=await applyChapterEdit(f.db,{writerId:7,chapterId:2,newBody:'ข้อความใหม่',fingerprint:'a'.repeat(64),confirm});
  assert.deepEqual(result,{ok:false,error:'confirmation_required'});
 }
 assert.equal(f.writes,0);
});
test('apply rejects stale fingerprint without writing',async()=>{
 const f=fixture();
 const result=await applyChapterEdit(f.db,{writerId:7,chapterId:2,newBody:'ข้อความใหม่',fingerprint:'a'.repeat(64),confirm:true});
 assert.deepEqual(result,{ok:false,error:'conflict'});
 assert.equal(f.writes,0);
});
test('undo requires confirmation and a positive history ID',async()=>{
 const f=fixture();
 const result=await undoChapterEdit(f.db,{writerId:7,historyId:1,confirm:false});
 assert.deepEqual(result,{ok:false,error:'confirmation_required'});
 assert.equal(f.writes,0);
});
