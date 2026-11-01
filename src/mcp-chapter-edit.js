// Owner-scoped chapter edit primitives. Preview is side-effect free.
// The caller must authenticate the writer before invoking these functions.
const digest=async value=>{
 const bytes=new TextEncoder().encode(value);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
};
const validId=n=>Number.isSafeInteger(n)&&n>0;
const load=(db,writerId,chapterId)=>db.prepare(
 'SELECT c.id,c.novel_id,c.title,c.body FROM chapters c JOIN novels n ON n.id=c.novel_id WHERE c.id=? AND n.author_id=?'
).bind(chapterId,writerId).first();
export async function previewChapterEdit(db,{writerId,chapterId,newBody}){
 if(!validId(writerId)||!validId(chapterId)||typeof newBody!=='string'||!newBody.trim()||newBody.length>300000)
  return {ok:false,error:'invalid_arguments'};
 const chapter=await load(db,writerId,chapterId);
 if(!chapter)return {ok:false,error:'not_found'};
 const fingerprint=await digest(chapter.body);
 return {ok:true,chapter_id:chapter.id,novel_id:chapter.novel_id,title:chapter.title,
  original_length:chapter.body.length,new_length:newBody.length,changed:chapter.body!==newBody,
  fingerprint};
}
export async function applyChapterEdit(db,{writerId,chapterId,newBody,fingerprint,confirm}){
 if(confirm!==true||typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))
  return {ok:false,error:'confirmation_required'};
 const preview=await previewChapterEdit(db,{writerId,chapterId,newBody});
 if(!preview.ok)return preview;
 if(preview.fingerprint!==fingerprint)return {ok:false,error:'conflict'};
 if(!preview.changed)return {ok:false,error:'unchanged'};
 // Compare-and-swap guards against concurrent edits; no unowned chapter can be changed.
 const chapter=await load(db,writerId,chapterId);
 if(!chapter||await digest(chapter.body)!==fingerprint)return {ok:false,error:'conflict'};
 if(typeof db.batch!=='function')return {ok:false,error:'atomic_batch_required'};
 const now=Math.floor(Date.now()/1000);
 // The history insert is conditional on the same current body and writer ownership.
 // Both statements commit together, so failed updates cannot leave orphan snapshots.
 const update=db.prepare(
  'UPDATE chapters SET body=? WHERE id=? AND body=? AND EXISTS (SELECT 1 FROM novels WHERE id=chapters.novel_id AND author_id=?)'
 ).bind(newBody,chapterId,chapter.body,writerId);
 const history=db.prepare(
  'INSERT INTO chapter_edit_history(chapter_id,novel_id,writer_id,before_body,after_body,created_at) SELECT c.id,c.novel_id,?,c.body,?,? FROM chapters c JOIN novels n ON n.id=c.novel_id WHERE c.id=? AND n.author_id=? AND c.body=?'
 ).bind(writerId,newBody,now,chapterId,writerId,chapter.body);
 // Snapshot must be captured before the update in the atomic D1 batch.
 const results=await db.batch([history,update]);
 if(results[0]?.meta?.changes!==1||results[1]?.meta?.changes!==1)return {ok:false,error:'conflict'};
 return {ok:true,chapter_id:chapterId,novel_id:chapter.novel_id};
}
