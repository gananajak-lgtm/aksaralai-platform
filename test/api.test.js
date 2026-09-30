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

test('local AI Voice Studio launcher stays hidden until admin-only TTS status permits it',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="local-ai-voice-studio"[^>]* hidden>/);
 assert.match(html,/async function revealAdminLocalVoiceStudio\(\)[\s\S]*?await api\('\/writer\/tts-preview\/status'\)[\s\S]*?status\.enabled\)section\.hidden=false/);
 assert.match(html,/chapterMp3Uploader\(id\);revealAdminLocalVoiceStudio\(\)/);
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
