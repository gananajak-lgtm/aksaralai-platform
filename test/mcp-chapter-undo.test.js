import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/sqlite-d1.js';
import {previewChapterEdit,applyChapterEdit,undoChapterEdit} from '../src/mcp-chapter-edit.js';
async function edited(){
 const db=fixture();
 const p=await previewChapterEdit(db,{writerId:3,chapterId:7,newBody:'Edited'});
 const saved=await applyChapterEdit(db,{writerId:3,chapterId:7,newBody:'Edited',fingerprint:p.fingerprint,confirm:true});
 assert.equal(saved.ok,true);
 return {db,id:saved.history_id};
}
const body=db=>db.sql.prepare('SELECT body FROM chapters WHERE id=7').get().body;
test('undo requires confirmation and current ownership in real SQL',async()=>{
 const {db,id}=await edited();
 assert.equal((await undoChapterEdit(db,{writerId:3,historyId:id,confirm:false})).error,'confirmation_required');
 assert.equal((await undoChapterEdit(db,{writerId:4,historyId:id,confirm:true})).error,'not_found');
 assert.equal(body(db),'Edited');db.sql.close();
});
test('undo checks latest content and writes an auditable reversal atomically',async()=>{
 const {db,id}=await edited();db.sql.exec("UPDATE chapters SET body='Newer edit' WHERE id=7");
 assert.equal((await undoChapterEdit(db,{writerId:3,historyId:id,confirm:true})).error,'conflict');
 db.sql.exec("UPDATE chapters SET body='Edited' WHERE id=7");
 const result=await undoChapterEdit(db,{writerId:3,historyId:id,confirm:true});
 assert.equal(result.ok,true);assert.equal(body(db),'Original');
 const h=db.sql.prepare('SELECT before_body,after_body FROM chapter_edit_history WHERE id=?').get(result.history_id);
 assert.deepEqual({...h},{before_body:'Edited',after_body:'Original'});
 assert.equal((await undoChapterEdit(db,{writerId:3,historyId:id,confirm:true})).error,'conflict');
 assert.ok(db.sql.prepare('SELECT updated_at FROM novels WHERE id=11').get().updated_at>1);db.sql.close();
});
test('concurrent revision returning to the same body prevents stale undo',async()=>{
 const {db,id}=await edited();const batch=db.batch.bind(db);
 db.batch=async statements=>{
  db.sql.exec("INSERT INTO chapter_edit_history(chapter_id,novel_id,writer_id,before_body,after_body,created_at) VALUES(7,11,3,'Later','Edited',2)");
  return batch(statements);
 };
 const result=await undoChapterEdit(db,{writerId:3,historyId:id,confirm:true});
 assert.equal(result.error,'conflict');assert.equal(body(db),'Edited');
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM chapter_edit_history').get().n,2);db.sql.close();
});
test('SQL failure rolls back undo and its reversal snapshot together',async()=>{
 const {db,id}=await edited();
 db.sql.exec("CREATE TRIGGER fail_undo BEFORE UPDATE ON chapters BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(undoChapterEdit(db,{writerId:3,historyId:id,confirm:true}),/test failure/);
 assert.equal(body(db),'Edited');assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM chapter_edit_history').get().n,1);db.sql.close();
});
test('SQL failure rolls back a save snapshot with the chapter update',async()=>{
 const db=fixture();const p=await previewChapterEdit(db,{writerId:3,chapterId:7,newBody:'Edited'});
 db.sql.exec("CREATE TRIGGER fail_save BEFORE UPDATE ON chapters BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(applyChapterEdit(db,{writerId:3,chapterId:7,newBody:'Edited',fingerprint:p.fingerprint,confirm:true}),/test failure/);
 assert.equal(body(db),'Original');assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM chapter_edit_history').get().n,0);db.sql.close();
});
