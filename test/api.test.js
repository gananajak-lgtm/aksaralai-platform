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
 assert.deepEqual(result,{status:200,enabled:false});
 assert.equal(JSON.stringify(result).includes('should-never-leak'),false);
 assert.equal(JSON.stringify(result).includes('wrong-user'),false);
 const disabled=harness();
 assert.equal((await disabled.api('/register','POST',{username:'writer99',display_name:'Writer',password:'long-password-04',role:'writer'})).status,201);
 assert.deepEqual(await disabled.api('/writer/tts-preview/status'),{status:200,enabled:false});
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

test('OpenAI preview returns safe actionable diagnostics without leaking provider response',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-key',OPENAI_TTS_ADMIN_USERNAME:'adminuser'});
 assert.equal((await h.api('/register','POST',{username:'adminuser',display_name:'Admin',password:'long-password-05',role:'writer'})).status,201);
 const n=await h.api('/writer/novels','POST',{title:'เรื่องทดสอบ',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนทดสอบ',body:'สวัสดี'});
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'secret should not be shown'}}),{status:429,headers:{'content-type':'application/json'}});
 try{
  const response=await h.api('/writer/chapters/'+c.id+'/tts/preview','POST',{});
  assert.equal(response.status,502);
  assert.equal(response.error_code,'insufficient_quota');
  assert.equal(response.provider_status,429);
  assert.equal(JSON.stringify(response).includes('secret should not be shown'),false);
  assert.equal((await h.api('/writer/tts-preview/status')).remaining,2);
 }finally{globalThis.fetch=original;}
});

test('standalone OpenAI studio supports owner text, voice and MP3 without consuming preview attempts',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-test-key',OPENAI_TTS_ADMIN_USERNAME:'adminvoice'});
 assert.equal((await h.api('/register','POST',{username:'adminvoice',display_name:'Owner',password:'long-password-06',role:'writer'})).status,201);
 const ownerCookie=h.getCookie();
 const good={text:'สวัสดีค่ะ นี่เป็นเสียงบรรยายที่ฉันต้องการดาวน์โหลดไปใช้งานอื่น',voice:'cedar',style:'mystery',speed:0.85};
 assert.equal((await h.api('/writer/tts/generate','POST',{...good,voice:'arbitrary-voice'})).status,400);
 assert.equal((await h.api('/writer/tts/generate','POST',{...good,style:'arbitrary-style'})).status,400);
 assert.equal((await h.api('/writer/tts/generate','POST',{...good,text:'ก'.repeat(1501)})).status,400);
 assert.equal((await h.api('/writer/tts/generate','POST',{...good,speed:3})).status,400);
 h.clear();
 assert.equal((await h.api('/writer/tts/generate','POST',good)).status,401);
 assert.equal((await h.api('/register','POST',{username:'other_voice',display_name:'Other',password:'long-password-07',role:'writer'})).status,201);
 assert.equal((await h.api('/writer/tts/generate','POST',good)).status,403);
 h.setCookie(ownerCookie);
 const original=globalThis.fetch;
 let count=0;
 globalThis.fetch=async(url,opts)=>{
  count++;
  assert.equal(url,'https://api.openai.com/v1/audio/speech');
  assert.equal(opts.headers.authorization,'Bearer fake-test-key');
  const body=JSON.parse(opts.body);
  assert.equal(body.model,'gpt-4o-mini-tts');
  assert.equal(body.input,good.text);
  assert.equal(body.voice,'cedar');
  assert.equal(body.speed,0.85);
  assert.match(body.instructions,/mysterious/);
  assert.equal(body.response_format,'mp3');
  return new Response(new Uint8Array(250),{status:200,headers:{'content-type':'audio/mpeg'}});
 };
 try{
  for(let i=0;i<4;i++){
   const req=new Request('https://example.com/api/writer/tts/generate',{method:'POST',headers:{cookie:ownerCookie,origin:'https://example.com','content-type':'application/json'},body:JSON.stringify(good)});
   const response=await worker.fetch(req,h.env);
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'audio/mpeg');
   assert.match(response.headers.get('content-disposition'),/attachment/);
   assert.equal((await response.arrayBuffer()).byteLength,250);
  }
  assert.equal(count,4);
  assert.equal((await h.api('/writer/tts-preview/status')).remaining,3);
 }finally{globalThis.fetch=original;}
});

test('standalone OpenAI studio does not leak provider responses when credits are unavailable',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-test-key',OPENAI_TTS_ADMIN_USERNAME:'adminfail'});
 assert.equal((await h.api('/register','POST',{username:'adminfail',display_name:'Owner',password:'long-password-08',role:'writer'})).status,201);
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'do not reveal this provider message'}}),{status:429,headers:{'content-type':'application/json'}});
 try{
  const r=await h.api('/writer/tts/generate','POST',{text:'สวัสดีครับ',voice:'marin',style:'narrator',speed:1});
  assert.equal(r.status,502);
  assert.match(r.detail,/เครดิต/);
  assert.equal(JSON.stringify(r).includes('do not reveal this provider message'),false);
 }finally{globalThis.fetch=original;}
});

test('local AI Voice Studio is visible to authors and uses the local PC, not paid admin TTS',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="local-ai-voice-studio"[^>]*>/);
 assert.doesNotMatch(html,/id="local-ai-voice-studio"[^>]* hidden>/);
 assert.match(html,/function setupLocalVoiceStudio\(copyFullChapter\)/);
 assert.match(html,/chapterMp3Uploader\(id\);setupLocalVoiceStudio\(joinChapterText\)/);
 assert.match(html,/id="voice-studio-open" hidden/);
});

test('mobile home uses compact book cards and collapsible accessible navigation',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/class="mobile-menu-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="mobile-navlinks"/);
 assert.match(html,/class="navlinks" id="mobile-navlinks"/);
 assert.match(html,/\.navlinks\.open\{display:flex\}/);
 assert.match(html,/\.tile\{display:grid;grid-template-columns:88px minmax\(0,1fr\)/);
 assert.match(html,/\.tile \.cover\{grid-column:1;grid-row:1 \/ span 5;width:88px;height:112px/);
 assert.match(html,/\.tile>p:nth-of-type\(2\)\{grid-row:4;display:-webkit-box;-webkit-line-clamp:2/);
 assert.match(html,/function closeMobileMenu\(\)/);
 assert.match(html,/menuToggle\.setAttribute\('aria-expanded',String\(opening\)\)/);
});

test('long chapter editing preserves all paragraph breaks and leading/trailing whitespace',async()=>{
 const h=harness();
 assert.equal((await h.api('/register','POST',{username:'longwriter',display_name:'Writer',password:'long-password-15',role:'writer'})).status,201);
 const n=await h.api('/writer/novels','POST',{title:'เรื่องยาว',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const original='  คำนำ  \n'+('บทสนทนา “ทดสอบ” และบรรยายยาวๆ\n\n'.repeat(1800))+'  จบตอน  \n';
 assert.ok(original.length>30000);
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนแรก',body:original});
 assert.equal(c.status,201);
 assert.equal((await h.api('/chapters/'+c.id)).chapter.body,original);
 const updated='\n'+original+'\nเพิ่มข้อความท้ายตอนและอีโมจิ 🎙️\n\n';
 assert.equal((await h.api('/writer/chapters/'+c.id,'PUT',{title:'ตอนแก้ไข',body:updated})).status,200);
 assert.equal((await h.api('/chapters/'+c.id)).chapter.body,updated);
 assert.equal((await h.api('/writer/chapters/'+c.id,'PUT',{title:'ตอนแก้ไข',body:'   \n   '})).status,400);
});

test('mobile long-chapter editor uses bounded editable segments and local draft recovery',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/function splitChapterText\(text\)/);
 assert.match(html,/max=4500/);
 assert.match(html,/chapterSegments\.join\(''\)/);
 assert.match(html,/d\.body=joinChapterText\(\)/);
 assert.match(html,/chapterEditor\.value=chapterSegments\[0\]/);
 assert.match(html,/backupTimer=setTimeout\(saveBackup,2500\)/);
 assert.match(html,/confirm\('พบข้อความแก้ไขที่ยังไม่ได้บันทึก/);
 assert.doesNotMatch(html,/<textarea name="body" required style="min-height:370px" maxlength="300000">\'\+esc\(chapter\?\.body/);
});

test('manuscript print export is admin-only, retains Thai manuscript and escapes HTML',async()=>{
 const h=harness({OPENAI_TTS_ADMIN_USERNAME:'pdf_owner'});
 assert.equal((await h.api('/register','POST',{username:'pdf_owner',display_name:'เจ้าของงาน',password:'long-password-pdf',role:'writer'})).status,201);
 const ownerCookie=h.getCookie();
 const book=await h.api('/writer/novels','POST',{title:'พยัคฆ์ & <เขา>',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const text1='  คำนำ\nย่อหน้าหนึ่ง <script>alert(1)</script> & ตัวอักษรไทย\n\nจบ   ';
 const one=await h.api('/writer/novels/'+book.id+'/chapters','POST',{title:'ตอนแรก <ทดสอบ>',body:text1});
 const two=await h.api('/writer/novels/'+book.id+'/chapters','POST',{title:'ตอนสอง',body:'เนื้อหาตอนสอง'});
 assert.equal(one.status,201);assert.equal(two.status,201);
 assert.equal((await h.api('/admin/status')).enabled,true);
 async function manuscript(path,cookie){
  return worker.fetch(new Request('https://example.com/api'+path,{headers:{cookie:cookie||''}}),h.env);
 }
 let response=await manuscript('/admin/novels/'+book.id+'/manuscript',ownerCookie);
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/text\/html/);
 assert.match(response.headers.get('cache-control'),/no-store/);
 const pdfHtml=await response.text();
 assert.ok(pdfHtml.includes('คำนำ\nย่อหน้าหนึ่ง'));
 assert.ok(pdfHtml.includes('ตอนสอง'));
 assert.ok(pdfHtml.includes('พยัคฆ์ &amp; &lt;เขา&gt;'));
 assert.ok(pdfHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.equal(pdfHtml.includes('<script>alert(1)</script>'),false);
 assert.match(pdfHtml,/@page\{size:A4/);
 response=await manuscript('/admin/novels/'+book.id+'/manuscript?chapter='+one.id,ownerCookie);
 assert.equal(response.status,200);
 const oneHtml=await response.text();
 assert.ok(oneHtml.includes('ตอนแรก'));
 assert.equal(oneHtml.includes('เนื้อหาตอนสอง'),false);
 assert.equal((await manuscript('/admin/novels/'+book.id+'/manuscript?chapter=999999',ownerCookie)).status,404);
 h.clear();
 assert.equal((await h.api('/admin/status')).enabled,false);
 assert.equal((await manuscript('/admin/novels/'+book.id+'/manuscript','')).status,401);
 assert.equal((await h.api('/register','POST',{username:'otherpdf',display_name:'นักเขียนอื่น',password:'long-password-pdf2',role:'writer'})).status,201);
 assert.equal((await h.api('/admin/status')).enabled,false);
 assert.equal((await manuscript('/admin/novels/'+book.id+'/manuscript',h.getCookie())).status,403);
 h.clear();
 assert.equal((await h.api('/register','POST',{username:'readerpdf',display_name:'นักอ่าน',password:'long-password-pdf3',role:'reader'})).status,201);
 assert.equal((await manuscript('/admin/novels/'+book.id+'/manuscript',h.getCookie())).status,403);
});
test('admin PDF buttons are hidden until privileged status confirms admin',()=>{
 const page=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(page,/id="export-novel-pdf" hidden/);
 assert.match(page,/id="export-chapter-pdf" hidden/);
 assert.match(page,/await api\('\/admin\/status'\)/);
 assert.match(page,/if\(!button\.isConnected\|\|!permission\.enabled\)return/);
 assert.match(page,/revealAdminPdfExport\(nid,id,function\(\)\{return chapterDirty;\}\)/);
});

test('novel detail layout gives mobile title and synopsis separate readable rows',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/class="panel novel-detail"/);
 assert.match(html,/class="cover novel-cover"/);
 assert.match(html,/class="novel-info"/);
 assert.match(html,/class="novel-summary"/);
 assert.match(html,/class="controls novel-actions"/);
 assert.match(html,/\.novel-summary\{grid-column:1\/-1;grid-row:2;/);
 assert.match(html,/\.novel-overview \.novel-cover\{grid-column:1;grid-row:1;width:94px;height:125px;/);
 assert.doesNotMatch(html,/min-width:170px;height:190px/);
});

test('Android APK uses native Thai TTS bridge, not unsupported WebView speechSynthesis',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const java=fs.readFileSync(new URL('../android/app/src/main/java/com/gananajak/aksaralai/MainActivity.java',import.meta.url),'utf8');
 const manifest=fs.readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 assert.match(html,/function androidSpeechEngine\(\)/);
 assert.match(html,/nativeMode=!!window\.AksaralaiTts/);
 assert.match(html,/engine=nativeMode\?androidSpeechEngine\(\):window\.speechSynthesis/);
 assert.match(html,/var utterance=new Utterance\(clean\)/);
 assert.match(html,/AksaralaiNativeSpeechFeedback/);
 assert.match(html,/bridge\.speak\(utterance\.text,utterance\.rate/);
 assert.match(java,/new TextToSpeech\(getApplicationContext\(\), status ->/);
 assert.match(java,/addJavascriptInterface\(new NativeSpeech\(\), "AksaralaiTts"\)/);
 assert.match(java,/nativeTts\.setLanguage\(thaiLocale\)/);
 assert.match(java,/UtteranceProgressListener/);
 assert.match(java,/nativeTts\.shutdown\(\)/);
 assert.match(manifest,/android\.intent\.action\.TTS_SERVICE/);
});

test('native Android TTS bridge does not access WebView from JavaScript interface thread',()=>{
 const java=fs.readFileSync(new URL('../android/app/src/main/java/com/gananajak/aksaralai/MainActivity.java',import.meta.url),'utf8');
 const nativeSpeech=java.slice(java.indexOf('private final class NativeSpeech'),java.indexOf('@SuppressLint("SetJavaScriptEnabled")'));
 assert.ok(nativeSpeech.includes('trustedTopLevelPage'));
 assert.doesNotMatch(nativeSpeech,/webView\.getUrl\(\)/);
 assert.match(java,/private volatile boolean trustedTopLevelPage = false/);
 assert.match(java,/onPageStarted\(WebView view, String url, android\.graphics\.Bitmap favicon\)/);
 assert.match(java,/onPageFinished\(WebView view, String url\) \{\s*trustedTopLevelPage = trusted\(url\)/);
 assert.match(java,/return trustedTopLevelPage \? nativeTtsStatus : 0/);
});

test('AI paragraph formatting is admin-only and verifies every original character',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-test-key',OPENAI_TTS_ADMIN_USERNAME:'formatowner'});
 assert.equal((await h.api('/register','POST',{username:'formatowner',display_name:'Owner',password:'long-password-formatter',role:'writer'})).status,201);
 const owner=h.getCookie();
 const original='  พรานสิงห์ยืนมองป่า เขาหยุดนิ่งแล้วฟังเสียง\nต่อมาได้ยินเสียงฝีเท้า  ';
 const formatted='  พรานสิงห์ยืนมองป่า \nเขาหยุดนิ่งแล้วฟังเสียง\nต่อมาได้ยินเสียงฝีเท้า  ';
 assert.equal((await h.api('/admin/format-text','POST',{text:''})).status,400);
 assert.equal((await h.api('/admin/format-text','POST',{text:'ท'.repeat(4501)})).status,400);
 h.clear();
 assert.equal((await h.api('/admin/format-text','POST',{text:original})).status,401);
 assert.equal((await h.api('/register','POST',{username:'formatter_other',display_name:'Other',password:'long-password-formatter2',role:'writer'})).status,201);
 assert.equal((await h.api('/admin/format-text','POST',{text:original})).status,403);
 h.setCookie(owner);
 const originalFetch=globalThis.fetch;
 const responses=[formatted,'พรานสิงห์ยืนมองป่า\nเขาหยุดนิ่งแล้วฟังเสียง\nต่อมาได้ยินเสียงฝีเท้า  ',original.replace('มอง','เห็น'),original+'ข้อความเพิ่มเติม'];
 let called=0;
 globalThis.fetch=async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');
  assert.equal(opts.headers.authorization,'Bearer fake-test-key');
  const body=JSON.parse(opts.body);
  assert.equal(body.model,'gpt-4o-mini');
  assert.equal(body.messages[1].content.endsWith(original),true);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({formatted:responses[called++]})}}]}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const good=await h.api('/admin/format-text','POST',{text:original});
  assert.equal(good.status,200);assert.equal(good.formatted,formatted);assert.equal(good.added_breaks,1);
  assert.equal((await h.api('/admin/format-text','POST',{text:original})).status,422);
  assert.equal((await h.api('/admin/format-text','POST',{text:original})).status,422);
  assert.equal((await h.api('/admin/format-text','POST',{text:original})).status,422);
  assert.equal(called,4);
 }finally{globalThis.fetch=originalFetch;}
});

test('AI paragraph formatter returns safe errors and never exposes provider messages',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-test-key',OPENAI_TTS_ADMIN_USERNAME:'formatfail'});
 assert.equal((await h.api('/register','POST',{username:'formatfail',display_name:'Owner',password:'long-password-formatter3',role:'writer'})).status,201);
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'Private provider details'}}),{status:429,headers:{'content-type':'application/json'}});
 try{
  const result=await h.api('/admin/format-text','POST',{text:'ข้อความไทย'});
  assert.equal(result.status,502);assert.match(result.detail,/เครดิต/);
  assert.equal(JSON.stringify(result).includes('Private provider details'),false);
 }finally{globalThis.fetch=old;}
});

test('admin manuscript formatting UI previews without changing the manuscript until confirmed',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="ai-format-section" hidden/);
 assert.match(html,/id="ai-format-preview"/);
 assert.match(html,/id="ai-format-before"/);
 assert.match(html,/id="ai-format-after"/);
 assert.match(html,/await api\('\/admin\/format-text','POST',\{text:original\}\)/);
 assert.match(html,/if\(current\.slice\(pending\.start,pending\.end\)!==pending\.original\)/);
 assert.match(html,/chapterEditor\.dispatchEvent\(new Event\('input'/);
 assert.match(html,/await api\('\/writer\/tts-preview\/status'\)/);
});

test('Android background TTS advances in native onDone without WebView JavaScript timers',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const java=fs.readFileSync(new URL('../android/app/src/main/java/com/gananajak/aksaralai/MainActivity.java',import.meta.url),'utf8');
 assert.match(java,/void nativeNext\(int session\)/);
 assert.match(java,/if\(batchSession!=session \|\| batchCursor!=pos\) return;\s*batchCursor=pos\+1;\s*nativeNext\(session\);/);
 assert.match(java,/nativeTts\.speak\(words, TextToSpeech\.QUEUE_ADD, null, "B-" \+ session/);
 assert.match(java,/savedBatchIndex\(String chapter, String signature\)/);
 assert.match(java,/onPause\(\) \{\s*appForeground=false/);
 assert.match(html,/nativeBatchMode=nativeMode&&engine\.batchAvailable/);
 assert.match(html,/engine\.batch\(prepared,pauseDurations,speed,voice\.value,current,nativeChapter,signature,batchBase\)/);
 assert.match(html,/AksaralaiNativeBatchFeedback/);
 assert.match(html,/engine\.batchState\(\)/);
});

test('AI admin assistant is admin-only, read-only and proposes only validated owner actions',async()=>{
 const h=harness({OPENAI_API_KEY:'test-api-key',OPENAI_TTS_ADMIN_USERNAME:'controlowner'});
 assert.equal((await h.api('/register','POST',{username:'controlowner',display_name:'Admin',password:'long-password-control1',role:'writer'})).status,201);
 const adminCookie=h.getCookie();
 const n=await h.api('/writer/novels','POST',{title:'เรื่องลึกลับ',summary:'คำโปรย',genre:'ลึกลับ',cover_color:'#7453a8'});
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนที่หนึ่ง',body:'ข้อความต้นฉบับห้ามเปลี่ยน'});
 assert.equal((await h.api('/admin/assistant','POST',{message:''})).status,400);
 h.clear();
 assert.equal((await h.api('/admin/assistant','POST',{message:'ดูนิยาย'})).status,401);
 assert.equal((await h.api('/register','POST',{username:'writer_other_ai',display_name:'Other',password:'long-password-control2',role:'writer'})).status,201);
 const other=await h.api('/writer/novels','POST',{title:'ข้อมูลคนอื่น',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 assert.equal((await h.api('/admin/assistant','POST',{message:'ดูนิยาย'})).status,403);
 h.setCookie(adminCookie);
 const originalFetch=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');
  assert.equal(opts.headers.authorization,'Bearer test-api-key');
  const req=JSON.parse(opts.body);
  assert.equal(req.model,'gpt-4o-mini');
  assert.ok(req.messages[1].content.includes('เรื่องลึกลับ'));
  assert.ok(!req.messages[1].content.includes('ข้อมูลคนอื่น'));
  assert.ok(!req.messages[1].content.includes('ข้อความต้นฉบับห้ามเปลี่ยน'));
  const choices=[
   {reply:'พบตอนที่ต้องการ กดปุ่มเพื่อเปิดหน้าแก้ไข',action:'format_chapter',novel_id:n.id,chapter_id:c.id},
   {reply:'เปิดเรื่องอื่น',action:'open_novel',novel_id:other.id,chapter_id:null},
   {reply:'ลบข้อมูลทั้งหมด',action:'delete_everything',novel_id:n.id,chapter_id:c.id}
  ];
  const selected=choices[calls++];
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(selected)}}]}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const good=await h.api('/admin/assistant','POST',{message:'เปิดตอนที่หนึ่งแล้วช่วยจัดย่อหน้า'});
  assert.equal(good.status,200);
  assert.deepEqual(good.proposal,{action:'format_chapter',label:'เปิดหน้าแก้ไขตอนเพื่อใช้ AI จัดย่อหน้า',novel_id:n.id,chapter_id:c.id});
  const illegalId=await h.api('/admin/assistant','POST',{message:'เปิดเรื่องอื่น'});
  assert.equal(illegalId.status,200);assert.equal(illegalId.proposal,null);
  const illegalAction=await h.api('/admin/assistant','POST',{message:'ลบทุกอย่าง'});
  assert.equal(illegalAction.status,200);assert.equal(illegalAction.proposal,null);
  assert.equal(calls,3);
  assert.equal((await h.api('/chapters/'+c.id)).chapter.body,'ข้อความต้นฉบับห้ามเปลี่ยน');
 }finally{globalThis.fetch=originalFetch;}
});

test('AI admin assistant does not leak model provider failures',async()=>{
 const h=harness({OPENAI_API_KEY:'test-api-key',OPENAI_TTS_ADMIN_USERNAME:'adminfailure'});
 assert.equal((await h.api('/register','POST',{username:'adminfailure',display_name:'Admin',password:'long-password-control3',role:'writer'})).status,201);
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'internal provider secret message'}}),{status:429,headers:{'content-type':'application/json'}});
 try{
  const result=await h.api('/admin/assistant','POST',{message:'สรุปรายการนิยาย'});
  assert.equal(result.status,502);assert.match(result.detail,/เครดิต/);
  assert.equal(JSON.stringify(result).includes('internal provider secret message'),false);
 }finally{globalThis.fetch=old;}
});

test('AI admin UI is hidden for regular writers and requires confirmation for navigation',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="ai-admin-open" hidden/);
 assert.match(html,/id="ai-admin-dialog"/);
 assert.match(html,/await api\('\/admin\/assistant','POST',\{message:message,chapter_id:contextChapter\}\)/);
 assert.match(html,/assistant\.hidden=!tts\.enabled/);
 assert.match(html,/confirm\.onclick=function\(\)/);
 assert.match(html,/if\(task\.action==='open_studio'\)go\('studio'\)/);
 assert.doesNotMatch(html,/new Function\(/);
});

test('AI admin formatter command uses the current owned chapter instead of refusing',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-test-key',OPENAI_TTS_ADMIN_USERNAME:'activeowner'});
 assert.equal((await h.api('/register','POST',{username:'activeowner',display_name:'Owner',password:'long-password-activeowner',role:'writer'})).status,201);
 const ownerCookie=h.getCookie();
 const n=await h.api('/writer/novels','POST',{title:'หมู่บ้านลึกลับ',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนหนึ่ง',body:'ห้ามปรับเนื้อหาเดิม'});
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({reply:'ทำไม่ได้',action:'none',novel_id:null,chapter_id:null})}}]}),{status:200,headers:{'content-type':'application/json'}});
 try{
  const response=await h.api('/admin/assistant','POST',{message:'จัดแถวและย่อหน้าให้เรียงตามความเหมาะสม ไม่ต้องเว้นบรรทัด',chapter_id:c.id});
  assert.equal(response.status,200);
  assert.equal(response.proposal.action,'format_chapter');
  assert.equal(response.proposal.chapter_id,c.id);
  assert.match(response.reply,/เครื่องมือจัดย่อหน้า/);
  assert.doesNotMatch(response.reply,/ทำไม่ได้/);
  const unknown=await h.api('/admin/assistant','POST',{message:'จัดย่อหน้า',chapter_id:999999});
  assert.equal(unknown.proposal,null);
 }finally{globalThis.fetch=old;}
 assert.equal((await h.api('/chapters/'+c.id)).chapter.body,'ห้ามปรับเนื้อหาเดิม');
 h.clear();
 assert.equal((await h.api('/admin/assistant','POST',{message:'จัดย่อหน้า',chapter_id:c.id})).status,401);
 h.setCookie(ownerCookie);
});

test('AI formatter never introduces extra empty lines',async()=>{
 const h=harness({OPENAI_API_KEY:'fake-test-key',OPENAI_TTS_ADMIN_USERNAME:'noblanks'});
 assert.equal((await h.api('/register','POST',{username:'noblanks',display_name:'Owner',password:'long-password-noblanks',role:'writer'})).status,201);
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({formatted:'สวัสดี\n\nครับ'})}}]}),{status:200,headers:{'content-type':'application/json'}});
 try{
  const response=await h.api('/admin/format-text','POST',{text:'สวัสดีครับ'});
  assert.equal(response.status,422);
  assert.match(response.detail,/บรรทัดว่าง/);
 }finally{globalThis.fetch=old;}
});

test('confirmed admin formatter action opens the selected editor and the existing review flow',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/pendingFormatChapterId=task.chapter_id/);
 assert.match(html,/Number\(pendingFormatChapterId\)===Number\(id\)/);
 assert.match(html,/trigger\.click\(\)/);
 assert.match(html,/confirm\('ยืนยันให้ OpenAI ช่วยจัดย่อหน้าข้อความ /);
 assert.match(html,/dialog\.showModal\(\)/);
 assert.match(html,/id="ai-format-before"/);
 assert.match(html,/id="ai-format-after"/);
});

test('admin can download DOCX and TXT without OpenAI, including unpublished Thai manuscripts',async()=>{
 const h=harness({OPENAI_TTS_ADMIN_USERNAME:'exportowner'});
 assert.equal((await h.api('/register','POST',{username:'exportowner',display_name:'Owner',password:'long-password-export1',role:'writer'})).status,201);
 const owner=h.getCookie();
 const n=await h.api('/writer/novels','POST',{title:'เงาซ่อนพยัคฆ์',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 const text='  บรรทัดแรก  \n\nบทสนทนา "สวัสดี" และ & < >\nบรรทัดท้าย ';
 const c=await h.api('/writer/novels/'+n.id+'/chapters','POST',{title:'ตอนที่ ๑',body:text});
 async function download(format,cookie=owner,novelId=n.id,chapterId=null){
  const url='https://example.com/api/admin/novels/'+novelId+'/manuscript?format='+format+(chapterId?'&chapter='+chapterId:'');
  return worker.fetch(new Request(url,{headers:cookie?{cookie}:{}}),h.env);
 }
 const doc=await download('docx');assert.equal(doc.status,200);
 assert.match(doc.headers.get('content-type'),/wordprocessingml/);
 assert.match(doc.headers.get('content-disposition'),/attachment/);
 const bytes=new Uint8Array(await doc.arrayBuffer());
 assert.equal(String.fromCharCode(...bytes.slice(0,4)),'PK\x03\x04');
 const decoded=new TextDecoder().decode(bytes);
 assert.match(decoded,/word\/document.xml/);
 assert.match(decoded,/เงาซ่อนพยัคฆ์/);
 assert.match(decoded,/บทสนทนา &quot;สวัสดี&quot; และ &amp; &lt; &gt;/);
 assert.match(decoded,/w:pgSz w:w="11906" w:h="16838"/);
 assert.match(decoded,/xml:space="preserve">  บรรทัดแรก  /);
 const txt=await download('txt',owner,n.id,c.id);
 assert.equal(txt.status,200);
 assert.match(txt.headers.get('content-type'),/text\/plain/);
 assert.equal(await txt.text(),'เงาซ่อนพยัคฆ์ — ตอนที่ ๑\n\n1. ตอนที่ ๑\n'+text);
 assert.equal((await download('xlsx')).status,400);
 assert.equal((await download('docx','')).status,401);
 assert.equal((await download('txt','',n.id,c.id)).status,401);
 h.clear();
 assert.equal((await h.api('/register','POST',{username:'not_exportowner',display_name:'Other',password:'long-password-export2',role:'writer'})).status,201);
 const otherCookie=h.getCookie();
 assert.equal((await download('docx',otherCookie)).status,403);
 h.setCookie(owner);
 const notOwned=await h.api('/writer/novels','POST',{title:'อีกเรื่อง',summary:'',genre:'ทั่วไป',cover_color:'#7453a8'});
 assert.equal((await download('docx',owner,notOwned.id,c.id)).status,404);
});

test('DOCX ZIP container parses, word XML keeps Thai text and blank manuscript lines',async()=>{
 const {makeDocx,makePlainText}=await import('../src/manuscript-export.js');
 const original='หน้าแรก\n\nประโยคสุดท้าย  ';
 const blob=makeDocx('ชื่อเรื่อง', [{position:1,title:'ชื่อตอน',body:original}]);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 assert.ok(bytes.length>300);
 let offset=0,entries=new Map();
 while(offset+30<bytes.length){
  const dv=new DataView(bytes.buffer,bytes.byteOffset+offset);
  if(dv.getUint32(0,true)!==0x04034b50)break;
  const nameLength=dv.getUint16(26,true),extra=dv.getUint16(28,true),length=dv.getUint32(18,true);
  const name=new TextDecoder().decode(bytes.subarray(offset+30,offset+30+nameLength));
  const start=offset+30+nameLength+extra;
  entries.set(name,new TextDecoder().decode(bytes.subarray(start,start+length)));
  offset=start+length;
 }
 assert.ok(entries.has('[Content_Types].xml'));
 assert.ok(entries.has('_rels/.rels'));
 assert.ok(entries.has('word/document.xml'));
 assert.ok(entries.has('word/_rels/document.xml.rels'));
 const xml=entries.get('word/document.xml');
 assert.match(xml,/หน้าแรก/);assert.match(xml,/ประโยคสุดท้าย  /);
 assert.match(xml,/w:pStyle w:val="Heading1"/);
 assert.ok(xml.includes('หน้าแรก</w:t></w:r></w:p><w:p>'));
 assert.ok(xml.includes('xml:space="preserve"></w:t>'));
 assert.equal(makePlainText('ชื่อเรื่อง',[{position:1,title:'ชื่อตอน',body:original}]),'ชื่อเรื่อง\n\n1. ชื่อตอน\n'+original);
});

test('format export menu is visible only after the existing admin authorization',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="export-novel-pdf" hidden/);
 assert.match(html,/id="export-chapter-pdf" hidden/);
 assert.match(html,/data-export-format="docx"/);
 assert.match(html,/data-export-format="txt"/);
 assert.match(html,/data-export-format="pdf"/);
 assert.match(html,/if\(!button\.isConnected\|\|!permission\.enabled\)return/);
});

test('whole chapter edit actions preserve the existing segmented mode and allow safe replace/clear/import',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="chapter-edit-all"/);
 assert.match(html,/id="chapter-edit-chunks" hidden/);
 assert.match(html,/id="chapter-replace-all"/);
 assert.match(html,/id="chapter-clear-all"/);
 assert.match(html,/id="chapter-import-txt"/);
 assert.match(html,/id="chapter-undo-whole" hidden/);
 assert.match(html,/wholeEditMode=true;\s*setChapterText\(full\)/);
 assert.match(html,/wholeEditMode=false;\s*setChapterText\(full\)/);
 assert.match(html,/if\(!wholeEditMode&&window\.matchMedia\('\(max-width:640px\)'\)\.matches&&text\.length>12000\)/);
 assert.match(html,/if\(!wholeEditMode&&chapterLength>12000&&window\.matchMedia/);
 assert.match(html,/var old=joinChapterText\(\)/);
 assert.match(html,/previousWholeReplacement=old/);
 assert.match(html,/setChapterText\(nextText\)/);
 assert.match(html,/scheduleBackup\(\);\s*\/\/ Important: save the new full chapter checkpoint right away/);
 assert.match(html,/saveBackup\(\);\s*chapterEditor\.focus\(\)/);
 assert.match(html,/replaceWholeChapter\('','ยืนยันล้างเนื้อหาทุกช่วงของตอนนี้'\)/);
 assert.match(html,/replaceWholeChapter\(value,'ยืนยันแทนที่เนื้อหาทั้งตอนด้วยข้อความที่วาง'\)/);
 assert.match(html,/replaceWholeChapter\(incoming,'ยืนยันนำเข้าไฟล์ /);
 assert.match(html,/previousWholeReplacement=null;\s*undoWholeButton\.hidden=true;\s*setChapterText\(original\)/);
 assert.match(html,/d\.body=joinChapterText\(\)/);
 assert.match(html,/if\(!d\.body\.trim\(\)\)\{toast\('กรุณากรอกเนื้อหานิยาย'\)/);
});

test('SPA browser Back follows history and Home exits without logging out',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/history\.pushState\(\{aksaralai:true,route:route,id:id\|\|null,depth:historyDepth\}/);
 assert.match(html,/window\.addEventListener\('popstate',function\(e\)/);
 assert.match(html,/historyDepth=state&&state\.aksaralai\?state\.depth\|\|0:0/);
 assert.match(html,/go\(route\|\|'home',id\|\|undefined,true\)/);
 assert.match(html,/if\(current\.route==='home'\)return false/);
 assert.doesNotMatch(html,/askLogoutFromHome|backLogoutBusy/);
 assert.match(html,/window\.aksaralaiAndroidBack=function\(\)/);
 assert.match(html,/history\.back\(\)/);
 assert.match(html,/history\.replaceState\(\{aksaralai:true,route:'home',id:null,depth:0\}/);
 assert.doesNotMatch(html,/window\.addEventListener\('hashchange',function\(\)/);
 const androidBack=html.slice(html.indexOf('window.aksaralaiAndroidBack=function(){'),html.indexOf('function card(n)',html.indexOf('window.aksaralaiAndroidBack=function(){')));
 assert.doesNotMatch(androidBack,/api\('\/logout'/);
 assert.match(html,/if\(route==='auth'&&user\)\{[\s\S]*?await api\('\/logout','POST',\{\}\)/);
});

test('Android hardware Back asks confirmation at Home and retains sign-in on cancel/exit',()=>{
 const java=fs.readFileSync(new URL('../android/app/src/main/java/com/gananajak/aksaralai/MainActivity.java',import.meta.url),'utf8');
 assert.match(java,/evaluateJavascript\([\s\S]{0,210}window\.aksaralaiAndroidBack/);
 assert.match(java,/if \("\\\"handled\\\""\.equals\(response\)\) return/);
 assert.match(java,/if \("\\\"exit\\\""\.equals\(response\)\) \{ confirmCloseApp\(\); return; \}/);
 assert.match(java,/private void confirmCloseApp\(\)/);
 assert.match(java,/\.setTitle\("ปิดแอปอักษราลัย"\)/);
 assert.match(java,/\.setMessage\("ต้องการปิดแอปหรือไม่\? ระบบจะเก็บการเข้าสู่ระบบไว้"\)/);
 assert.match(java,/\.setNegativeButton\("ยกเลิก"/);
 assert.match(java,/\.setPositiveButton\("ปิดแอป", \(dialog, which\) -> finish\(\)\)/);
 assert.match(java,/\.setOnDismissListener\(dialog -> closePromptShowing = false\)/);
 assert.match(java,/if \(isFinishing\(\) \|\| isDestroyed\(\) \|\| closePromptShowing\) return/);
 assert.match(java,/else confirmCloseApp\(\)/);
 assert.doesNotMatch(java,/if \("\\\"exit\\\""\.equals\(response\)\) \{ finish\(\)/);
 assert.match(java,/onJsConfirm\(WebView view, String url, String message, JsResult result\)/);
 assert.match(java,/new AlertDialog\.Builder\(MainActivity\.this\)/);
 assert.match(java,/\.setNegativeButton\("ยกเลิก"/);
});

test('navigation persists unsaved chapter backup before returning to previous screen',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/window\.aksaralaiPreserveDraft=function\(\)\{if\(chapterDirty\)\{clearTimeout\(backupTimer\);saveBackup\(\);\}\};/);
 assert.match(html,/if\(typeof window\.aksaralaiPreserveDraft==='function'\)/);
});

test('local voice studio links full unsaved manuscript to free desktop MP3 workflow',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="local-ai-voice-studio"/);
 assert.match(html,/id="voice-copy-chapter"/);
 assert.match(html,/href="http:\/\/127\.0\.0\.1:8765\/"/);
 assert.match(html,/setupLocalVoiceStudio\(joinChapterText\)/);
 assert.match(html,/var text=copyFullChapter\(\)/);
 assert.match(html,/await navigator\.clipboard\.writeText\(text\)/);
 assert.match(html,/modal\.querySelector\('textarea'\)\.value=text/);
 assert.match(html,/chapterMp3Uploader\(id\)/);
 assert.doesNotMatch(html,/revealAdminLocalVoiceStudio/);
});

test('playback resume is isolated for three different users sharing one Android app',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const java=fs.readFileSync(new URL('../android/app/src/main/java/com/gananajak/aksaralai/MainActivity.java',import.meta.url),'utf8');
 // Each reader has a separate MP3 checkpoint even for the exact same published chapter.
 assert.match(html,/var key='aksaralai\.mp3\.position\.user\.'\+user\.id\+'\.chapter\.'\+chapterId/);
 assert.doesNotMatch(html,/var key='aksaralai\.mp3\.position\.'\+chapterId/);
 // Each reader has a separate speech checkpoint and "listen again" shortcut.
 assert.match(html,/storageKey='aksaralai\.tts\.chapter\.user\.'\+accountId\+'\.chapter\.'\+chapterId/);
 assert.match(html,/lastListeningKey='aksaralai\.tts\.last\.user\.'\+accountId/);
 assert.match(html,/localStorage\.getItem\('aksaralai\.tts\.last\.user\.'\+user\.id\)/);
 assert.match(html,/localStorage\.setItem\(lastListeningKey,JSON\.stringify/);
 assert.match(html,/localStorage\.removeItem\(lastListeningKey\)/);
 // Native background TTS does not read or overwrite the previous account's position.
 assert.match(html,/nativeChapter=accountId\+':'\+chapterId/);
 assert.match(html,/engine\.savedBatchIndex\(nativeChapter,signature\)/);
 assert.match(html,/engine\.batch\(prepared,pauseDurations,speed,voice\.value,current,nativeChapter,signature,batchBase\)/);
 assert.match(html,/String\(state\.chapter\)!==nativeChapter/);
 assert.equal((java.match(/chapter\.matches\("\[0-9\]\{1,12\}:\[0-9\]\{1,12\}"\)/g)||[]).length,2);
 assert.match(java,/getString\("progress\." \+ chapter,/);
 assert.match(java,/putString\("progress\." \+ batchChapter,/);
 const savedPositions=new Map();
 for(const [userId,index] of [[1,7],[2,32],[3,85]])
  savedPositions.set('aksaralai.tts.chapter.user.'+userId+'.chapter.42',index);
 assert.deepEqual([1,2,3].map(id=>savedPositions.get('aksaralai.tts.chapter.user.'+id+'.chapter.42')),[7,32,85]);
 const nativePositions=new Map();
 for(const [userId,index] of [[1,7],[2,32],[3,85]])nativePositions.set('progress.'+userId+':42',index);
 assert.deepEqual([1,2,3].map(id=>nativePositions.get('progress.'+id+':42')),[7,32,85]);
 // Legacy shared checkpoints are never reused or silently migrated into an account.
 assert.doesNotMatch(html,/getItem\('aksaralai\.tts\.last'\)/);
 assert.doesNotMatch(html,/getItem\('aksaralai\.tts\.chapter\.'\+chapterId\)/);
 assert.doesNotMatch(html,/getItem\('aksaralai\.mp3\.position\.'\+chapterId\)/);
});

test('dialogue-only pauses preserve narration flow in browser and Android native background TTS',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const java=fs.readFileSync(new URL('../android/app/src/main/java/com/gananajak/aksaralai/MainActivity.java',import.meta.url),'utf8');
 assert.match(html,/id="tts-pause" aria-label="ระยะพักเสียงเมื่อเปลี่ยนบทพูด"/);
 for(const ms of [0,600,1000,1500,2200])assert.match(html,new RegExp('<option value="'+ms+'">'));
 assert.match(html,/localStorage\.getItem\('aksaralai\.tts\.dialoguePauseMs'\)/);
 assert.match(html,/localStorage\.setItem\('aksaralai\.tts\.dialoguePauseMs',String\(pauseMs\)\)/);
 assert.match(html,/function dialoguePauseAfter\(parts,i,pause\)/);
 assert.match(html,/var delay=\(paragraphEnd\?320:0\)\+dialoguePauseAfter\(parts,index-1,pauseMs\)/);
 assert.match(html,/var pauseDurations=prepared\.map\(function\(_,pos\)\{return dialoguePauseAfter\(parts,batchBase\+pos,pauseMs\);\}\)/);
 assert.match(html,/bridge\.speakBatch\(JSON\.stringify\(parts\),JSON\.stringify\(pauses\),speed/);
 assert.match(java,/public void speakBatch\(String json, String pauseJson, double speed/);
 assert.match(java,/if \(silences\.length\(\) != arr\.length\(\)\) return/);
 assert.match(java,/if \(pause < 0 \|\| pause > 2200\) return/);
 assert.match(java,/batchPauses = pauses/);
 assert.match(java,/nativeTts\.playSilentUtterance\(pause, TextToSpeech\.QUEUE_ADD/);
 assert.match(java,/utteranceId\.startsWith\("P-"\)/);
 assert.match(java,/batchCursor=pos\+1;\s*nativeNext\(session\)/);
 assert.doesNotMatch(java,/@JavascriptInterface public void setBatchPause/);
});
