import {previewChapterEdit,applyChapterEdit,undoChapterEdit} from './mcp-chapter-edit.js';

// Optional personal bridge: read-only catalogue is public, edits require a private
// server-side key and explicit writer identity. Never place the key in client JS.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const validId=n=>Number.isSafeInteger(n)&&n>0;
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const parseId=s=>/^[1-9][0-9]*$/.test(s||'')&&Number.isSafeInteger(Number(s))?Number(s):null;
const safeEqual=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
};
export async function personalLibraryBridge(request,env){
 const db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 if(!db)return json({error:'database_unavailable'},503);
 if(env.AKSARALAI_PUBLIC_LIBRARY_ENABLED!=='true')return json({error:'disabled'},503);
 if(method==='GET'&&path==='/api/library/novels')
  return json({novels:await rows(db,'SELECT id,title,summary,updated_at FROM novels ORDER BY updated_at DESC LIMIT 100')});
 let match=path.match(/^\/api\/library\/novels\/(\d+)\/chapters$/);
 if(method==='GET'&&match){
  const id=parseId(match[1]);if(!id)return json({error:'invalid_id'},400);
  const novel=await db.prepare('SELECT id FROM novels WHERE id=?').bind(id).first();
  if(!novel)return json({error:'not_found'},404);
  return json({chapters:await rows(db,'SELECT id,title,position FROM chapters WHERE novel_id=? ORDER BY position,id LIMIT 500',id)});
 }
 match=path.match(/^\/api\/library\/chapters\/(\d+)$/);
 if(method==='GET'&&match){
  const id=parseId(match[1]);if(!id)return json({error:'invalid_id'},400);
  const chapter=await db.prepare('SELECT id,novel_id,title,position,body FROM chapters WHERE id=?').bind(id).first();
  return chapter?json({chapter}):json({error:'not_found'},404);
 }
 if(method!=='POST'||path!=='/api/library/edit')return json({error:'not_found'},404);
 if(env.AKSARALAI_LIBRARY_WRITE_ENABLED!=='true')return json({error:'write_disabled'},503);
 const configured=env.AKSARALAI_LIBRARY_WRITE_KEY;
 const provided=request.headers.get('authorization');
 if(typeof configured!=='string'||configured.length<32||!safeEqual(provided,'Bearer '+configured))return json({error:'unauthorized'},401);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415);
 const declared=Number(request.headers.get('content-length')||0);
 if(!Number.isFinite(declared)||declared<0||declared>1500000)return json({error:'too_large'},413);
 const raw=await request.text();
 if(new TextEncoder().encode(raw).length>1500000)return json({error:'too_large'},413);
 let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'invalid_json'},400);
 const writerId=Number(env.AKSARALAI_LIBRARY_WRITER_ID);
 if(!validId(writerId))return json({error:'writer_not_configured'},503);
 const writer=await db.prepare("SELECT id FROM users WHERE id=? AND role='writer'").bind(writerId).first();
 if(!writer)return json({error:'writer_not_found'},403);
 let result;
 if(body.action==='preview')result=await previewChapterEdit(db,{writerId,chapterId:body.chapter_id,newBody:body.new_body});
 else if(body.action==='apply')result=await applyChapterEdit(db,{writerId,chapterId:body.chapter_id,newBody:body.new_body,fingerprint:body.fingerprint,confirm:body.confirm});
 else if(body.action==='undo')result=await undoChapterEdit(db,{writerId,historyId:body.history_id,confirm:body.confirm});
 else return json({error:'invalid_action'},400);
 return json(result,result.ok?200:409);
}
