// Aksaralai — Cloudflare Worker + D1.
const enc = new TextEncoder();
const clock = () => Math.floor(Date.now()/1000);
const failure = (status,detail) => { throw Object.assign(new Error(detail),{status}); };
const reply = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const query = (db,sql,...v) => db.prepare(sql).bind(...v).first();
const rows = async(db,sql,...v) => (await db.prepare(sql).bind(...v).all()).results;
const run = (db,sql,...v) => db.prepare(sql).bind(...v).run();
function str(obj,key,min=0,max=1000){if(typeof obj[key]!=='string')failure(400,'ข้อมูล '+key+' ไม่ถูกต้อง');const value=obj[key].trim();if(value.length<min||value.length>max)failure(400,'ความยาว '+key+' ไม่ถูกต้อง');return value;}
async function payload(req){if(Number(req.headers.get('content-length')||0)>1500000)failure(413,'ข้อมูลใหญ่เกินกำหนด');if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))failure(415,'ต้องส่ง JSON');const raw=await req.text();if(enc.encode(raw).length>1500000)failure(413,'ข้อมูลใหญ่เกินกำหนด');let value;try{value=JSON.parse(raw);}catch{failure(400,'JSON ไม่ถูกต้อง');}if(!value||Array.isArray(value)||typeof value!=='object')failure(400,'รูปแบบข้อมูลไม่ถูกต้อง');return value;}
const hex=arr=>Array.from(arr,x=>x.toString(16).padStart(2,'0')).join('');
async function sha(str){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(str))));}
// Workers production caps one PBKDF2 invocation at 100,000 iterations. This MVP hashing
// cost is below current OWASP recommendations: review stronger password storage before launch.
async function deriv(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256)));}
async function passwordHash(password){const salt=crypto.getRandomValues(new Uint8Array(16));return hex(salt)+':'+await deriv(password,salt);}
async function matches(password,stored){if(!/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored||''))return false;const [s,h]=stored.split(':');const salt=Uint8Array.from(s.match(/../g),x=>parseInt(x,16));const test=await deriv(password,salt);let diff=0;for(let i=0;i<h.length;i++)diff|=h.charCodeAt(i)^test.charCodeAt(i);return diff===0;}
const cookie=req=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aksaralai_session='))?.slice(18)||'';
const sessionCookie=(token,seconds)=>'aksaralai_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+seconds;
async function session(db,user){const token=hex(crypto.getRandomValues(new Uint8Array(32)));await run(db,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',await sha(token),user,clock()+1209600);return sessionCookie(token,1209600);}
async function identity(db,req,required=false){const token=cookie(req);const user=token?await query(db,'SELECT u.id,u.username,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',await sha(token),clock()):null;if(required&&!user)failure(401,'กรุณาเข้าสู่ระบบ');return user;}
async function author(db,req){const user=await identity(db,req,true);if(user.role!=='writer')failure(403,'ต้องใช้บัญชีนักเขียน');return user;}
async function own(db,nid,user){const novel=await query(db,'SELECT * FROM novels WHERE id=? AND author_id=?',nid,user.id);if(!novel)failure(404,'ไม่พบเรื่องที่มีสิทธิ์จัดการ');return novel;}
async function novel(db,nid,user){const n=await query(db,'SELECT * FROM novels WHERE id=?',nid);if(!n||(!n.published&&n.author_id!==user?.id))failure(404,'ไม่พบนิยาย');return n;}
async function chapter(db,cid,user){const c=await query(db,'SELECT * FROM chapters WHERE id=?',cid);if(!c)failure(404,'ไม่พบตอน');const n=await novel(db,c.novel_id,user);if(!c.published&&n.author_id!==user?.id)failure(404,'ไม่พบตอน');return {c,n,owner:n.author_id===user?.id};}
const integer=s=>{if(!/^[1-9][0-9]*$/.test(s||''))failure(404,'ไม่พบข้อมูล');return Number(s);};
function novelData(d){return {title:str(d,'title',1,120),summary:str(d,'summary',0,3000),genre:str(d,'genre',0,40)||'ทั่วไป',cover_color:/^#[\da-fA-F]{6}$/.test(d.cover_color||'')?d.cover_color:'#7453a8'};}
function chapterData(d){return {title:str(d,'title',1,120),body:str(d,'body',1,300000)};}
function visibility(d){if(typeof d.published!=='boolean')failure(400,'สถานะเผยแพร่ไม่ถูกต้อง');return d.published?1:0;}
async function api(req,env){
 const db=env.DB,u=new URL(req.url),p=u.pathname,m=req.method;let x;
 if(!db)failure(503,'ยังไม่เชื่อมต่อฐานข้อมูล D1');
 if(p==='/api/register'&&m==='POST'){
  const d=await payload(req),username=str(d,'username',3,24),name=str(d,'display_name',1,50),password=str(d,'password',8,128);
  if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)||!['reader','writer'].includes(d.role))failure(400,'บัญชีหรือบทบาทไม่ถูกต้อง');
  // Keep diagnostic stages coarse: never expose passwords, hashes, or SQL internals.
  let passhash;
  try { passhash=await passwordHash(password); }
  catch(e){throw Object.assign(new Error('AUTH_HASH'),{code:'AUTH_HASH',cause:e});}
  let r;
  try {r=await run(db,'INSERT INTO users(username,display_name,passhash,role,created_at) VALUES(?,?,?,?,?)',username,name,passhash,d.role,clock());}
  catch(e){if(/UNIQUE/i.test(String(e)))failure(409,'ชื่อผู้ใช้ซ้ำ');throw Object.assign(new Error('AUTH_INSERT'),{code:'AUTH_INSERT',cause:e});}
  try {return reply({ok:true},201,{'set-cookie':await session(db,r.meta.last_row_id)});}
  catch(e){throw Object.assign(new Error('AUTH_SESSION'),{code:'AUTH_SESSION',cause:e});}
 }
 if(p==='/api/login'&&m==='POST'){
  const d=await payload(req),username=str(d,'username',1,24),password=str(d,'password',1,128);
  let user;try{user=await query(db,'SELECT * FROM users WHERE username=?',username);}catch(e){throw Object.assign(new Error('LOGIN_LOOKUP'),{code:'LOGIN_LOOKUP',cause:e});}
  if(!user)failure(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  let valid;try{valid=await matches(password,user.passhash);}catch(e){throw Object.assign(new Error('LOGIN_VERIFY'),{code:'LOGIN_VERIFY',cause:e});}
  if(!valid)failure(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  try{return reply({ok:true},200,{'set-cookie':await session(db,user.id)});}catch(e){throw Object.assign(new Error('LOGIN_SESSION'),{code:'LOGIN_SESSION',cause:e});}
 }
 if(p==='/api/logout'&&m==='POST'){const token=cookie(req);if(token)await run(db,'DELETE FROM sessions WHERE token_hash=?',await sha(token));return reply({ok:true},200,{'set-cookie':sessionCookie('',0)});}
 if(p==='/api/me'&&m==='GET')return reply({user:await identity(db,req)});
 if(p==='/api/novels'&&m==='GET'){
  const term=(u.searchParams.get('q')||'').trim().slice(0,120),genre=(u.searchParams.get('genre')||'').trim().slice(0,40);
  let sql='SELECT n.id,n.title,n.summary,n.genre,n.cover_color,n.updated_at,u.display_name AS author,(SELECT COUNT(*) FROM chapters c WHERE c.novel_id=n.id AND c.published=1) chapter_count FROM novels n JOIN users u ON u.id=n.author_id WHERE n.published=1',bind=[];
  if(term){sql+=' AND (n.title LIKE ? OR n.summary LIKE ? OR u.display_name LIKE ?)';bind.push(...Array(3).fill('%'+term+'%'));}
  if(genre){sql+=' AND n.genre=?';bind.push(genre);}
  sql+=u.searchParams.get('sort')==='title'?' ORDER BY n.title COLLATE NOCASE LIMIT 100':' ORDER BY n.updated_at DESC LIMIT 100';
  return reply({novels:await rows(db,sql,...bind)});
 }
 if(m==='GET'&&(x=p.match(/^\/api\/novels\/(\d+)$/))){
  const user=await identity(db,req),n=await novel(db,integer(x[1]),user),owner=n.author_id===user?.id;
  const person=await query(db,'SELECT display_name FROM users WHERE id=?',n.author_id);
  const chapters=await rows(db,'SELECT id,title,position,published FROM chapters WHERE novel_id=? '+(owner?'':'AND published=1 ')+'ORDER BY position',n.id);
  const saved=Boolean(user&&await query(db,'SELECT 1 FROM shelves WHERE user_id=? AND novel_id=?',user.id,n.id));
  const progress=user?await query(db,'SELECT chapter_id FROM progress WHERE user_id=? AND novel_id=?',user.id,n.id):null;
  return reply({novel:n,author:person.display_name,chapters,saved,progress,is_owner:owner});
 }
 if(m==='GET'&&(x=p.match(/^\/api\/chapters\/(\d+)$/))){
  const user=await identity(db,req,true),{c,n,owner}=await chapter(db,integer(x[1]),user);
  if(user)await run(db,'INSERT INTO progress(user_id,novel_id,chapter_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,novel_id) DO UPDATE SET chapter_id=excluded.chapter_id,updated_at=excluded.updated_at',user.id,n.id,c.id,clock());
  const chapters=await rows(db,'SELECT id,title,position FROM chapters WHERE novel_id=? '+(owner?'':'AND published=1 ')+'ORDER BY position',n.id);
  return reply({chapter:c,novel:{id:n.id,title:n.title},chapters});
 }

 // Preview only: fail closed unless a specific existing writer is explicitly configured.
 // OpenAI is called server-side only; the API key never reaches the browser.
 if(m==='GET'&&p==='/api/writer/tts-preview/status'){
  const user=await author(db,req);
  const enabled=Boolean(env.OPENAI_API_KEY&&env.OPENAI_TTS_ADMIN_USERNAME&&user.username===env.OPENAI_TTS_ADMIN_USERNAME);
  if(!enabled)return reply({enabled:false});
  const day=new Date().toISOString().slice(0,10);
  const usage=await query(db,'SELECT used FROM tts_preview_usage WHERE day_utc=? AND username=?',day,user.username);
  return reply({enabled:true,remaining:Math.max(0,3-(usage?.used||0)),daily_limit:3});
 }
 if(m==='POST'&&(x=p.match(/^\/api\/writer\/chapters\/(\d+)\/tts\/preview$/))){
  const user=await author(db,req),cid=integer(x[1]);
  if(!env.OPENAI_API_KEY||!env.OPENAI_TTS_ADMIN_USERNAME||user.username!==env.OPENAI_TTS_ADMIN_USERNAME)failure(403,'ทดลองเสียงได้เฉพาะบัญชีผู้ดูแลที่ตั้งค่าไว้');
  const c=await query(db,'SELECT novel_id FROM chapters WHERE id=?',cid);
  if(!c)failure(404,'ไม่พบตอน');
  await own(db,c.novel_id,user);
  const day=new Date().toISOString().slice(0,10);
  const slot=await query(db,'INSERT INTO tts_preview_usage(day_utc,username,used) VALUES(?,?,1) ON CONFLICT(day_utc,username) DO UPDATE SET used=used+1 WHERE used<3 RETURNING used',day,user.username);
  if(!slot)failure(429,'ทดลองเสียงครบ 3 ครั้งของวันนี้แล้ว (ตามเวลา UTC)');
  // Fixed short sample: no user-controlled input or bulk generation in this costly endpoint.
  const sample='สวัสดีค่ะ ยินดีต้อนรับสู่อักษราลัย คืนนี้สายลมพัดผ่านยอดไม้ พรานสิงห์หยุดฟังเสียงจากความมืด ก่อนจะค่อย ๆ ก้าวเดินต่อไป';
  const response=await fetch('https://api.openai.com/v1/audio/speech',{
   method:'POST',
   headers:{'authorization':'Bearer '+env.OPENAI_API_KEY,'content-type':'application/json'},
   body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'marin',input:sample,instructions:'Speak natural, intelligible Thai as a calm audiobook narrator. Respect Thai word boundaries and punctuation. Do not translate. No background sounds.',response_format:'mp3'})
  });
  if(!response.ok){
   console.error('TTS preview provider error',response.status);
   failure(502,'ระบบสร้างเสียงยังไม่พร้อม กรุณาตรวจสอบเครดิต OpenAI API และตั้งค่าโมเดล');
  }
  return new Response(response.body,{status:200,headers:{'content-type':'audio/mpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline; filename="aksaralai-tts-preview.mp3"','x-preview-remaining':String(3-slot.used)}});
 }

 // Each MP3 is private in R2. Chapter access uses the same membership rules as text.
 if((m==='GET')&&(x=p.match(/^\/api\/chapters\/(\d+)\/audio\/status$/))){
  const user=await identity(db,req,true);
  await chapter(db,integer(x[1]),user);
  if(!env.AUDIO)return reply({available:false,configured:false});
  const file=await env.AUDIO.head('chapters/'+x[1]+'.mp3');
  return reply({available:Boolean(file),configured:true,size:file?.size||0});
 }
 if((m==='GET')&&(x=p.match(/^\/api\/chapters\/(\d+)\/audio$/))){
  const user=await identity(db,req,true);
  await chapter(db,integer(x[1]),user);
  if(!env.AUDIO)failure(503,'ยังไม่เปิดใช้งานพื้นที่เก็บเสียง MP3');
  const key='chapters/'+x[1]+'.mp3',head=await env.AUDIO.head(key);
  if(!head)failure(404,'ตอนนี้ยังไม่มีเสียง MP3');
  const headers=new Headers({'content-type':'audio/mpeg','accept-ranges':'bytes','cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline'});
  const r=req.headers.get('range');let range,status=200;
  if(r){
   const match=/^bytes=(\d*)-(\d*)$/.exec(r);
   if(!match||(match[1]===''&&match[2]===''))return new Response(null,{status:416,headers:{'content-range':'bytes */'+head.size,'accept-ranges':'bytes','cache-control':'no-store'}});
   let start=match[1]===''?Math.max(0,head.size-Number(match[2])):Number(match[1]);
   let end=match[1]===''?head.size-1:(match[2]===''?head.size-1:Number(match[2]));
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start> end||start>=head.size||!head.size)return new Response(null,{status:416,headers:{'content-range':'bytes */'+head.size,'accept-ranges':'bytes','cache-control':'no-store'}});
   end=Math.min(end,head.size-1);range={offset:start,length:end-start+1};status=206;
   headers.set('content-range','bytes '+start+'-'+end+'/'+head.size);
   headers.set('content-length',String(range.length));
  }else headers.set('content-length',String(head.size));
  const file=await env.AUDIO.get(key,range?{range}:undefined);
  if(!file?.body)failure(404,'ไม่พบไฟล์เสียง');
  return new Response(file.body,{status,headers});
 }
 if((m==='PUT'||m==='DELETE')&&(x=p.match(/^\/api\/writer\/chapters\/(\d+)\/audio$/))){
  const user=await author(db,req),cid=integer(x[1]),c=await query(db,'SELECT novel_id FROM chapters WHERE id=?',cid);
  if(!c)failure(404,'ไม่พบตอน');
  await own(db,c.novel_id,user);
  if(!env.AUDIO)failure(503,'กรุณาเชื่อมพื้นที่เก็บไฟล์ Cloudflare R2 ก่อนอัปโหลด');
  const key='chapters/'+cid+'.mp3';
  if(m==='DELETE'){await env.AUDIO.delete(key);return reply({ok:true});}
  const length=Number(req.headers.get('content-length')),type=(req.headers.get('content-type')||'').toLowerCase().split(';')[0];
  if(!Number.isSafeInteger(length)||length<128||length>40*1024*1024)failure(413,'ไฟล์ MP3 ต้องมีขนาดระหว่าง 128 ไบต์ถึง 40 MB');
  if(type!=='audio/mpeg'&&type!=='audio/mp3')failure(415,'กรุณาเลือกไฟล์ MP3 เท่านั้น');
  if(!req.body)failure(400,'ไม่พบข้อมูลไฟล์');
  await env.AUDIO.put(key,req.body,{httpMetadata:{contentType:'audio/mpeg'}});
  return reply({ok:true,size:length});
 }
 if(m==='GET'&&(x=p.match(/^\/api\/chapters\/(\d+)\/comments$/))){
  const user=await identity(db,req,true);await chapter(db,integer(x[1]),user);
  return reply({comments:await rows(db,'SELECT c.id,c.body,c.created_at,u.display_name author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.chapter_id=? ORDER BY c.id DESC LIMIT 100',integer(x[1]))});
 }
 if(m==='POST'&&(x=p.match(/^\/api\/chapters\/(\d+)\/comments$/))){
  const user=await identity(db,req,true),d=await payload(req),text=str(d,'body',1,1000),{c,n}=await chapter(db,integer(x[1]),user);
  if(!c.published||!n.published)failure(404,'ตอนนี้ยังไม่เปิดให้แสดงความคิดเห็น');
  await run(db,'INSERT INTO comments(chapter_id,user_id,body,created_at) VALUES(?,?,?,?)',c.id,user.id,text,clock());return reply({ok:true},201);
 }
 if(p==='/api/shelf'&&m==='GET'){
  const user=await identity(db,req,true);
  return reply({novels:await rows(db,'SELECT n.id,n.title,n.summary,n.genre,n.cover_color,u.display_name author,p.chapter_id,(SELECT COUNT(*) FROM chapters c WHERE c.novel_id=n.id AND c.published=1) chapter_count FROM shelves s JOIN novels n ON n.id=s.novel_id JOIN users u ON u.id=n.author_id LEFT JOIN progress p ON p.novel_id=n.id AND p.user_id=s.user_id WHERE s.user_id=? AND n.published=1 ORDER BY n.updated_at DESC',user.id)});
 }
 if(m==='POST'&&(x=p.match(/^\/api\/novels\/(\d+)\/shelf$/))){
  const user=await identity(db,req,true),n=await novel(db,integer(x[1]),user);
  const exists=await query(db,'SELECT 1 FROM shelves WHERE user_id=? AND novel_id=?',user.id,n.id);
  if(exists)await run(db,'DELETE FROM shelves WHERE user_id=? AND novel_id=?',user.id,n.id);
  else await run(db,'INSERT INTO shelves(user_id,novel_id) VALUES(?,?)',user.id,n.id);
  return reply({saved:!exists});
 }
 if(p==='/api/writer/novels'&&m==='GET'){
  const user=await author(db,req);
  return reply({novels:await rows(db,'SELECT n.*,(SELECT COUNT(*) FROM chapters c WHERE c.novel_id=n.id) chapter_count FROM novels n WHERE n.author_id=? ORDER BY n.updated_at DESC',user.id)});
 }
 if(p==='/api/writer/novels'&&m==='POST'){
  const user=await author(db,req),d=novelData(await payload(req)),t=clock();
  const r=await run(db,'INSERT INTO novels(author_id,title,summary,genre,cover_color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',user.id,d.title,d.summary,d.genre,d.cover_color,t,t);
  return reply({id:r.meta.last_row_id},201);
 }
 if(m==='PUT'&&(x=p.match(/^\/api\/writer\/novels\/(\d+)$/))){
  const user=await author(db,req),nid=integer(x[1]);await own(db,nid,user);const d=novelData(await payload(req));
  await run(db,'UPDATE novels SET title=?,summary=?,genre=?,cover_color=?,updated_at=? WHERE id=?',d.title,d.summary,d.genre,d.cover_color,clock(),nid);
  return reply({ok:true});
 }
 if(m==='POST'&&(x=p.match(/^\/api\/writer\/novels\/(\d+)\/publish$/))){
  const user=await author(db,req),nid=integer(x[1]);await own(db,nid,user);const flag=visibility(await payload(req));
  if(flag&&!(await query(db,'SELECT 1 FROM chapters WHERE novel_id=? AND published=1',nid)))failure(400,'ต้องเผยแพร่อย่างน้อยหนึ่งตอนก่อน');
  await run(db,'UPDATE novels SET published=?,updated_at=? WHERE id=?',flag,clock(),nid);return reply({ok:true});
 }
 if(m==='POST'&&(x=p.match(/^\/api\/writer\/novels\/(\d+)\/chapters$/))){
  const user=await author(db,req),nid=integer(x[1]);await own(db,nid,user);const d=chapterData(await payload(req));
  const pos=(await query(db,'SELECT COALESCE(MAX(position),0)+1 pos FROM chapters WHERE novel_id=?',nid)).pos;
  const r=await run(db,'INSERT INTO chapters(novel_id,title,body,position,created_at) VALUES(?,?,?,?,?)',nid,d.title,d.body,pos,clock());
  await run(db,'UPDATE novels SET updated_at=? WHERE id=?',clock(),nid);return reply({id:r.meta.last_row_id},201);
 }
 if(m==='PUT'&&(x=p.match(/^\/api\/writer\/chapters\/(\d+)$/))){
  const user=await author(db,req),cid=integer(x[1]),c=await query(db,'SELECT * FROM chapters WHERE id=?',cid);if(!c)failure(404,'ไม่พบตอน');
  await own(db,c.novel_id,user);const d=chapterData(await payload(req));
  await run(db,'UPDATE chapters SET title=?,body=? WHERE id=?',d.title,d.body,cid);
  await run(db,'UPDATE novels SET updated_at=? WHERE id=?',clock(),c.novel_id);return reply({ok:true});
 }
 if(m==='POST'&&(x=p.match(/^\/api\/writer\/chapters\/(\d+)\/publish$/))){
  const user=await author(db,req),cid=integer(x[1]),c=await query(db,'SELECT * FROM chapters WHERE id=?',cid);if(!c)failure(404,'ไม่พบตอน');
  await own(db,c.novel_id,user);const flag=visibility(await payload(req));
  await run(db,'UPDATE chapters SET published=? WHERE id=?',flag,cid);
  await run(db,'UPDATE novels SET updated_at=? WHERE id=?',clock(),c.novel_id);return reply({ok:true});
 }
 failure(404,'ไม่พบ API ที่เรียกใช้');
}
export default {async fetch(req,env){
 const url=new URL(req.url),m=req.method;
 if(url.pathname==='/health')return reply({status:'ok'});
 if(url.pathname.startsWith('/api/')){
  if(!['GET','POST','PUT','DELETE'].includes(m))return reply({detail:'Method not allowed'},405,{allow:'GET, POST, PUT, DELETE'});
  if(m!=='GET'){
   const origin=req.headers.get('origin');
   if(origin!==null&&origin!==url.origin)return reply({detail:'Forbidden origin'},403);
   if(req.headers.get('sec-fetch-site')==='cross-site')return reply({detail:'Forbidden site'},403);
  }
  try{return await api(req,env);}catch(e){const status=Number.isInteger(e.status)?e.status:500;if(status===500)console.error('API failure',String(e));return reply({detail:status===500?'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์':e.message,...(status===500?{code:['AUTH_HASH','AUTH_INSERT','AUTH_SESSION','LOGIN_LOOKUP','LOGIN_VERIFY','LOGIN_SESSION'].includes(e.code)?e.code:'API_UNEXPECTED'}:{})},status);}
 }
 if(!['GET','HEAD'].includes(m))return new Response('Method not allowed',{status:405});
 if(!env.ASSETS)return new Response('Missing static assets binding',{status:503});
 return env.ASSETS.fetch(req);
}};