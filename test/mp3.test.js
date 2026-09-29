import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';

function setup({r2=true}={}){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const p=sqlite.prepare(sql);let args=[];return {
  bind(...v){args=v;return this;},async first(){return p.get(...args)||null;},
  async all(){return {results:p.all(...args)};},
  async run(){const x=p.run(...args);return {meta:{last_row_id:Number(x.lastInsertRowid),changes:Number(x.changes)}};}
 };}};
 const bucket=new Map();
 const AUDIO={
  async head(k){const data=bucket.get(k);return data?{size:data.length}:null;},
  async put(k,stream){const bytes=new Uint8Array(await new Response(stream).arrayBuffer());bucket.set(k,bytes);return {size:bytes.length};},
  async get(k,opts){const data=bucket.get(k);if(!data)return null;
   const part=opts?.range?data.slice(opts.range.offset,opts.range.offset+opts.range.length):data;
   return {body:new Blob([part]).stream(),size:data.length};
  },
  async delete(k){bucket.delete(k);}
 };
 let cookie='';
 const env={DB,...(r2?{AUDIO}:{})};
 async function request(path,method='GET',body,headers={}){
  const h={...(method!=='GET'?{origin:'https://example.com'}:{}),...(cookie?{cookie}:{}),...headers};
  if(body!==undefined&&body!==null&&!h['content-type'])h['content-type']='application/json';
  const init={method,headers:h};
  if(body!==undefined&&body!==null){
   init.body=typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body);
   if(body instanceof Uint8Array)init.duplex='half';
  }
  const res=await worker.fetch(new Request('https://example.com/api'+path,init),env);
  const setCookie=res.headers.get('set-cookie');
  if(setCookie)cookie=setCookie.split(';')[0];
  return res;
 }
 async function json(path,method='GET',data,headers){const r=await request(path,method,data,headers);return {status:r.status,...await r.json()};}
 return {request,json,getCookie(){return cookie;},setCookie(v){cookie=v;},bucket};
}
test('R2 audio: ownership, membership, byte-range streaming and deletion',async()=>{
 const h=setup();
 assert.equal((await h.json('/register','POST',{username:'audioauthor',display_name:'Author',password:'long-password-01',role:'writer'})).status,201);
 const authorCookie=h.getCookie();
 const n=await h.json('/writer/novels','POST',{title:'หนังสือเสียง',summary:'',genre:'นิยาย',cover_color:'#7453a8'});
 const c=await h.json('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนแรก',body:'สวัสดีผู้อ่าน'});
 assert.equal((await h.json('/chapters/'+c.id+'/audio/status')).available,false);
 const sound=new Uint8Array(256);sound.set([73,68,51],0);
 for(let i=3;i<sound.length;i++)sound[i]=i%256;
 h.setCookie('');
 assert.equal((await h.json('/chapters/'+c.id+'/audio/status')).status,401);
 assert.equal((await h.request('/chapters/'+c.id+'/audio')).status,401);
 assert.equal((await h.json('/register','POST',{username:'audioreader',display_name:'Reader',password:'long-password-02',role:'reader'})).status,201);
 const readerCookie=h.getCookie();
 assert.equal((await h.json('/writer/chapters/'+c.id+'/audio','PUT',sound,{'content-type':'audio/mpeg','content-length':'256'})).status,403);
 h.setCookie(authorCookie);
 assert.equal((await h.json('/writer/chapters/'+c.id+'/audio','PUT',sound,{'content-type':'audio/mpeg','content-length':'256'})).status,200);
 assert.equal((await h.json('/chapters/'+c.id+'/audio/status')).available,true);
 assert.equal(h.bucket.get('chapters/'+c.id+'.mp3').length,256);
 h.setCookie(readerCookie);
 // Published chapter and published novel are required for non-owner readers.
 assert.equal((await h.request('/chapters/'+c.id+'/audio')).status,404);
 h.setCookie(authorCookie);
 await h.json('/writer/chapters/'+c.id+'/publish','POST',{published:true});
 await h.json('/writer/novels/'+n.id+'/publish','POST',{published:true});
 h.setCookie(readerCookie);
 const full=await h.request('/chapters/'+c.id+'/audio');
 assert.equal(full.status,200);
 assert.equal(full.headers.get('content-type'),'audio/mpeg');
 assert.equal(full.headers.get('accept-ranges'),'bytes');
 assert.deepEqual(new Uint8Array(await full.arrayBuffer()),sound);
 const part=await h.request('/chapters/'+c.id+'/audio','GET',undefined,{range:'bytes=10-19'});
 assert.equal(part.status,206);
 assert.equal(part.headers.get('content-range'),'bytes 10-19/256');
 assert.deepEqual(new Uint8Array(await part.arrayBuffer()),sound.slice(10,20));
 const tail=await h.request('/chapters/'+c.id+'/audio','GET',undefined,{range:'bytes=-10'});
 assert.equal(tail.status,206);
 assert.deepEqual(new Uint8Array(await tail.arrayBuffer()),sound.slice(-10));
 assert.equal((await h.request('/chapters/'+c.id+'/audio','GET',undefined,{range:'bytes=9999-'})).status,416);
 assert.equal((await h.json('/writer/chapters/'+c.id+'/audio','DELETE')).status,403);
 h.setCookie(authorCookie);
 assert.equal((await h.json('/writer/chapters/'+c.id+'/audio','DELETE')).status,200);
 assert.equal((await h.json('/chapters/'+c.id+'/audio/status')).available,false);
});
test('R2 missing: API reports setup requirement without damaging existing text',async()=>{
 const h=setup({r2:false});
 assert.equal((await h.json('/register','POST',{username:'audiowriter2',display_name:'Author',password:'long-password-01',role:'writer'})).status,201);
 const n=await h.json('/writer/novels','POST',{title:'นิยายเดิม',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const c=await h.json('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนเดิม',body:'เนื้อหาเดิม'});
 const status=await h.json('/chapters/'+c.id+'/audio/status');
 assert.equal(status.status,200);assert.equal(status.configured,false);
 assert.equal((await h.json('/writer/chapters/'+c.id+'/audio','PUT',new Uint8Array(256),{'content-type':'audio/mpeg','content-length':'256'})).status,503);
 assert.equal((await h.json('/chapters/'+c.id)).chapter.body,'เนื้อหาเดิม');
});
