import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 sqlite.exec(fs.readFileSync(new URL('../migrations/0002_tts_preview.sql',import.meta.url),'utf8'));
 return {prepare(sql){let args=[];const p=sqlite.prepare(sql);return {bind(...v){args=v;return this},async first(){return p.get(...args)||null},async all(){return {results:p.all(...args)}},async run(){const r=p.run(...args);return {meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)}}}}}};
}
function harness(extraEnv={}){
 const env={DB:database(),ASSETS:{fetch:async()=>new Response('asset')},...extraEnv};let cookie='';
 return {async api(path,method='GET',data,headers={}){
  const req=new Request('https://example.com/api'+path,{method,headers:{...(method==='GET'?{}:{'content-type':'application/json','origin':'https://example.com'}),...(cookie?{cookie}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  const res=await worker.fetch(req,env);if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,...await res.json()};
 },env,getCookie(){return cookie;},setCookie(s){cookie=s;},clear(){cookie='';}};
}
test('writer publishes, reader saves reads comments and cannot edit',async()=>{
 const h=harness();
 assert.equal((await h.api('/register','POST',{username:'writer01',display_name:'นักเขียน',password:'long-password-01',role:'writer'})).status,201);
 const wc=h.getCookie();
 const n=await h.api('/writer/novels','POST',{title:'นิยายใหม่',summary:'เรื่องทดสอบ',genre:'แฟนตาซี',cover_color:'#7453a8'});
 assert.equal(n.status,201);
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนแรก',body:'วันหนึ่งในป่า'});
 assert.equal(c.status,201);
 assert.equal((await h.api('/writer/novels/'+n.id+'/publish','POST',{published:true})).status,400);
 assert.equal((await h.api('/writer/chapters/'+c.id+'/publish','POST',{published:true})).status,200);
 assert.equal((await h.api('/writer/novels/'+n.id+'/publish','POST',{published:true})).status,200);
 h.clear();
 assert.equal((await h.api('/register','POST',{username:'reader01',display_name:'นักอ่าน',password:'long-password-02',role:'reader'})).status,201);
 const rc=h.getCookie();
 assert.equal((await h.api('/novels')).novels.length,1);
 assert.equal((await h.api('/chapters/'+c.id)).chapter.body,'วันหนึ่งในป่า');
 assert.equal((await h.api('/writer/novels/'+n.id,'PUT',{title:'hacked',summary:'',genre:'',cover_color:'#7453a8'})).status,403);
 assert.equal((await h.api('/novels/'+n.id+'/shelf','POST',{})).saved,true);
 assert.equal((await h.api('/shelf')).novels.length,1);
 assert.equal((await h.api('/chapters/'+c.id+'/comments','POST',{body:'เยี่ยม!'})).status,201);
 assert.equal((await h.api('/chapters/'+c.id+'/comments')).comments.length,1);
 h.setCookie(wc);
 assert.equal((await h.api('/writer/chapters/'+c.id+'/publish','POST',{published:false})).status,200);
 h.setCookie(rc);
 assert.equal((await h.api('/chapters/'+c.id)).status,404);
 h.setCookie(wc);
 assert.equal((await h.api('/writer/novels/'+n.id+'/publish','POST',{published:false})).status,200);
 h.setCookie(rc);
 assert.equal((await h.api('/novels/'+n.id)).status,404);
 assert.equal((await h.api('/logout','POST',{})).status,200);
 assert.equal((await h.api('/me')).user,null);
});
test('reject foreign origins, duplicate usernames and incorrect passwords',async()=>{
 const h=harness(),d={username:'writer02',display_name:'Writer',password:'long-password-01',role:'writer'};
 assert.equal((await h.api('/register','POST',d,{origin:'https://foreign.example'})).status,403);
 assert.equal((await h.api('/register','POST',d)).status,201);
 assert.equal((await h.api('/register','POST',d)).status,409);
 assert.equal((await h.api('/login','POST',{username:'writer02',password:'wrong'})).status,401);
 assert.equal((await h.api('/login','POST',{username:'writer02',password:'long-password-01'})).status,200);
});

test('accepts large Thai chapters beyond prior 200KB request limit',async()=>{
 const h=harness();
 assert.equal((await h.api('/register','POST',{username:'longwriter',display_name:'Long Author',password:'long-password-01',role:'writer'})).status,201);
 const novel=await h.api('/writer/novels','POST',{title:'นิยายยาว',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 assert.equal(novel.status,201);
 const body='ก'.repeat(80000); // 240KB UTF-8, previously rejected.
 const chapter=await h.api('/writer/novels/'+novel.id+'/chapters','POST',{title:'ตอนที่สอง',body});
 assert.equal(chapter.status,201);
 const fetched=await h.api('/chapters/'+chapter.id);
 assert.equal(fetched.chapter.body.length,80000);
});
test('refuses chapter over 300k characters',async()=>{
 const h=harness();
 assert.equal((await h.api('/register','POST',{username:'lengthwriter',display_name:'Length Author',password:'long-password-01',role:'writer'})).status,201);
 const novel=await h.api('/writer/novels','POST',{title:'ขนาดตอน',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const chapter=await h.api('/writer/novels/'+novel.id+'/chapters','POST',{title:'เกินกำหนด',body:'ก'.repeat(300001)});
 assert.equal(chapter.status,400);
});

test('anonymous visitors can browse the catalog but cannot fetch chapter content or comments',async()=>{
 const h=harness();
 assert.equal((await h.api('/register','POST',{username:'gatedwriter',display_name:'ผู้เขียน',password:'long-password-01',role:'writer'})).status,201);
 const n=await h.api('/writer/novels','POST',{title:'เรื่องสำหรับสมาชิก',summary:'คำโปรย',genre:'ทั่วไป',cover_color:'#7453a8'});
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนแรก',body:'เนื้อหาที่ต้องเข้าสู่ระบบ'});
 assert.equal((await h.api('/writer/chapters/'+c.id+'/publish','POST',{published:true})).status,200);
 assert.equal((await h.api('/writer/novels/'+n.id+'/publish','POST',{published:true})).status,200);
 h.clear();
 assert.equal((await h.api('/novels')).novels.length,1);
 assert.equal((await h.api('/novels/'+n.id)).novel.title,'เรื่องสำหรับสมาชิก');
 const chapter=await h.api('/chapters/'+c.id);
 assert.equal(chapter.status,401);
 assert.equal(chapter.chapter,undefined);
 assert.equal((await h.api('/chapters/'+c.id+'/comments')).status,401);
 assert.equal((await h.api('/register','POST',{username:'gatedreader',display_name:'ผู้อ่าน',password:'long-password-02',role:'reader'})).status,201);
 assert.equal((await h.api('/chapters/'+c.id)).chapter.body,'เนื้อหาที่ต้องเข้าสู่ระบบ');
});

test('preview diagnostics only reveal presence and username match, never secret values',async()=>{
 const h=harness({OPENAI_API_KEY:'should-never-leak',OPENAI_TTS_ADMIN_USERNAME:'wrong-user'});
 assert.equal((await h.api('/register','POST',{username:'gananajak',display_name:'Owner',password:'long-password-03',role:'writer'})).status,201);
 const result=await h.api('/writer/tts-preview/status');
 assert.deepEqual(result,{status:200,enabled:false,checks:{api_key_present:true,admin_username_present:true,username_matches:false}});
 assert.equal(JSON.stringify(result).includes('should-never-leak'),false);
 assert.equal(JSON.stringify(result).includes('wrong-user'),false);
 const disabled=harness();
 assert.equal((await disabled.api('/register','POST',{username:'writer99',display_name:'Writer',password:'long-password-04',role:'writer'})).status,201);
 assert.deepEqual((await disabled.api('/writer/tts-preview/status')).checks,{api_key_present:false,admin_username_present:false,username_matches:false});
});
test('OpenAI preview is disabled by default and reserved for configured owner with three daily attempts',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-test-key',OPENAI_TTS_ADMIN_USERNAME:'adminwriter'});
 const admin={username:'adminwriter',display_name:'ผู้ดูแล',password:'long-password-01',role:'writer'};
 assert.equal((await h.api('/register','POST',admin)).status,201);
 const n=await h.api('/writer/novels','POST',{title:'เรื่อง',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอน',body:'ข้อความทดสอบ'});
 const ownerCookie=h.getCookie();
 assert.equal((await h.api('/writer/tts-preview/status')).remaining,3);
 h.clear();
 assert.equal((await h.api('/register','POST',{username:'otherwriter',display_name:'ผู้อื่น',password:'long-password-02',role:'writer'})).status,201);
 assert.equal((await h.api('/writer/tts-preview/status')).enabled,false);
 assert.equal((await h.api('/writer/chapters/'+c.id+'/tts/preview','POST',{})).status,403);
 h.setCookie(ownerCookie);
 const nativeFetch=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;
  assert.equal(url,'https://api.openai.com/v1/audio/speech');
  assert.equal(options.headers.authorization,'Bearer fake-test-key');
  const body=JSON.parse(options.body);
  assert.equal(body.model,'gpt-4o-mini-tts');
  assert.ok(body.input.length<500);
  return new Response(new Uint8Array(256),{status:200,headers:{'content-type':'audio/mpeg'}});
 };
 try{
  for(let i=0;i<3;i++){
   // API harness normally parses JSON, so fetch raw audio for this endpoint.
   const request=new Request('https://example.com/api/writer/chapters/'+c.id+'/tts/preview',{method:'POST',headers:{cookie:ownerCookie,origin:'https://example.com'}});
   const response=await worker.fetch(request,h.env);
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'audio/mpeg');
  }
  assert.equal((await h.api('/writer/chapters/'+c.id+'/tts/preview','POST',{})).status,429);
  assert.equal(calls,3);
  assert.equal((await h.api('/writer/tts-preview/status')).remaining,0);
 }finally{globalThis.fetch=nativeFetch;}
});
