import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {previewChapterEdit,applyChapterEdit} from '../src/mcp-chapter-edit.js';
globalThis.crypto??=webcrypto;
function db(){
 const state={body:'Original manuscript',writes:0,history:[]};
 return {state,async batch(statements){
  const results=[];
  for(const stmt of statements)results.push(await stmt.run());
  return results;
 },prepare(sql){return {bind(...args){return {
  async first(){
   if(!sql.includes('JOIN novels'))throw Error('Unexpected select');
   return args[0]===7&&args[1]===3?{id:7,novel_id:11,title:'Chapter',body:state.body}:null;
  },
  async run(){
   if(sql.includes('INSERT INTO chapter_edit_history')){
    if(args[3]!==7||args[4]!==3||args[5]!==state.body)return {meta:{changes:0}};
    state.history.push({before:state.body,after:args[1]});return {meta:{changes:1}};
   }
   if(sql.includes('UPDATE novels'))return {meta:{changes:1}};
   if(!sql.includes('UPDATE chapters'))throw Error('Unexpected update');
   if(args[1]!==7||args[2]!==state.body||args[3]!==3)return {meta:{changes:0}};
   state.body=args[0];state.writes++;return {meta:{changes:1}};
  }
 };}}}};
}
test('preview does not write; confirmed matching fingerprint updates one owned chapter',async()=>{
 const store=db();
 const preview=await previewChapterEdit(store,{writerId:3,chapterId:7,newBody:'Revised manuscript'});
 assert.equal(preview.ok,true);
 assert.equal(store.state.writes,0);
 assert.equal(store.state.history.length,0);
 assert.equal((await applyChapterEdit(store,{writerId:3,chapterId:7,newBody:'Revised manuscript',fingerprint:preview.fingerprint,confirm:false})).ok,false);
 const saved=await applyChapterEdit(store,{writerId:3,chapterId:7,newBody:'Revised manuscript',fingerprint:preview.fingerprint,confirm:true});
 assert.equal(saved.ok,true);assert.equal(store.state.body,'Revised manuscript');assert.equal(store.state.writes,1);
 assert.deepEqual(store.state.history,[{before:'Original manuscript',after:'Revised manuscript'}]);
});
test('rejects unauthorized writers and stale fingerprints',async()=>{
 const store=db();
 assert.equal((await previewChapterEdit(store,{writerId:99,chapterId:7,newBody:'Other'})).error,'not_found');
 const p=await previewChapterEdit(store,{writerId:3,chapterId:7,newBody:'Updated'});
 store.state.body='Changed elsewhere';
 assert.equal((await applyChapterEdit(store,{writerId:3,chapterId:7,newBody:'Updated',fingerprint:p.fingerprint,confirm:true})).error,'conflict');
 assert.equal(store.state.writes,0);
});

test('preview fingerprint cannot authorize a different proposed chapter body',async()=>{
 const store=db();
 const preview=await previewChapterEdit(store,{writerId:3,chapterId:7,newBody:'Approved revision'});
 const result=await applyChapterEdit(store,{writerId:3,chapterId:7,newBody:'Unapproved revision',fingerprint:preview.fingerprint,confirm:true});
 assert.equal(result.error,'conflict');
 assert.equal(store.state.body,'Original manuscript');
 assert.equal(store.state.history.length,0);
 assert.equal(store.state.writes,0);
});

test('supports long Thai chapter revisions and rejects empty manuscripts',async()=>{
 const store=db();
 const body='ก'.repeat(30000);
 const preview=await previewChapterEdit(store,{writerId:3,chapterId:7,newBody:body});
 assert.equal(preview.ok,true);
 assert.equal(preview.new_length,30000);
 assert.equal((await applyChapterEdit(store,{writerId:3,chapterId:7,newBody:body,fingerprint:preview.fingerprint,confirm:true})).ok,true);
 assert.equal(store.state.body,body);
 assert.equal((await previewChapterEdit(store,{writerId:3,chapterId:7,newBody:'   '})).error,'invalid_arguments');
});
