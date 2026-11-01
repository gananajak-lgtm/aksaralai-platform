import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {undoChapterEdit} from '../src/mcp-chapter-edit.js';
globalThis.crypto??=webcrypto;
function fixture(){
 const state={body:'Edited',writes:0,latestId:9};
 return {state,prepare(sql){return {bind(...args){return {
  async first(){
   if(sql.includes('SELECT id FROM chapter_edit_history'))return {id:state.latestId};
   if(sql.includes('FROM chapter_edit_history'))return args[0]===9&&args[1]===3&&args[2]===3?
    {id:9,chapter_id:7,novel_id:11,before_body:'Original',after_body:'Edited'}:null;
   if(sql.includes('JOIN novels'))return args[0]===7&&args[1]===3?
    {id:7,novel_id:11,title:'Chapter',body:state.body}:null;
   throw Error('Unexpected SELECT');
  },
  async run(){
   if(!sql.includes('UPDATE chapters'))throw Error('Unexpected UPDATE');
   if(args[1]!==7||args[2]!==state.body||args[3]!==3)return {meta:{changes:0}};
   state.body=args[0];state.writes++;return {meta:{changes:1}};
  }
 };}}}};
}
test('undo requires explicit confirmation and correct writer',async()=>{
 const store=fixture();
 assert.equal((await undoChapterEdit(store,{writerId:3,historyId:9,confirm:false})).error,'confirmation_required');
 assert.equal((await undoChapterEdit(store,{writerId:4,historyId:9,confirm:true})).error,'not_found');
 assert.equal(store.state.writes,0);
});
test('undo restores only unchanged post-edit manuscript',async()=>{
 const store=fixture();
 store.state.body='Newer edit';
 assert.equal((await undoChapterEdit(store,{writerId:3,historyId:9,confirm:true})).error,'conflict');
 assert.equal(store.state.writes,0);
 store.state.body='Edited';
 assert.equal((await undoChapterEdit(store,{writerId:3,historyId:9,confirm:true})).ok,true);
 assert.equal(store.state.body,'Original');
 assert.equal(store.state.writes,1);
});

test('undo refuses a superseded snapshot even if its after-body matches',async()=>{
 const store=fixture();
 store.state.latestId=10;
 const result=await undoChapterEdit(store,{writerId:3,historyId:9,confirm:true});
 assert.equal(result.error,'conflict');
 assert.equal(store.state.writes,0);
});
