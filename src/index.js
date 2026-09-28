// Aksaralai — Cloudflare Worker + D1.
const enc = new TextEncoder();
const clock = () => Math.floor(Date.now()/1000);
const failure = (status,detail) => { throw Object.assign(new Error(detail),{status}); };
const reply = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const query = (db,sql,...v) => db.prepare(sql).bind(...v).first();
const rows = async(db,sql,...v) => (await db.prepare(sql).bind(...v).all()).results;
const run = (db,sql,...v) => db.prepare(sql).bind(...v).run();
function str(obj,key,min=0,max=1000){if(typeof obj[key]!=='string')failure(400,'ข้อมูล '+key+' ไม่ถูกต้อง');const value=obj[key].trim();if(value.length<min||value.length>max)failure(400,'ความยาว '+key+' ไม่ถูกต้อง');return value;}
async function payload(req){if(Number(req.headers.get('content-length')||0)>200000)failure(413,'ข้อมูลใหญ่เกินกำหนด');if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))failure(415,'ต้องส่ง JSON');const raw=await req.text();if(enc.encode(raw).length>200000)failure(413,'ข้อมูลใหญ่เกินกำหนด');let value;try{value=JSON.parse(raw);}catch{failure(400,'JSON ไม่ถูกต้อง');}if(!value||Array.isArray(value)||typeof value!=='object')failure(400,'รูปแบบข้อมูลไม่ถูกต้อง');return value;}
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
function chapterData(d){return {title:str(d,'title',1,120),body:str(d,'body',1,150000)};}
function visibility(d){if(typeof d.published!=='boolean')failure(400,'สถานะเผยแพร่ไม่ถูกต้อง');return d.published?1:0;}
async function api(req,env){
 const db=env.DB,u=new URL(req.url),p=u.pathname,m=req.method;let x;
 if(!db)failure(503,'ยังไม่เชื่อมต่อฐานข้อมูล D1');
 if(p==='/api/register'&&m==='POST'){
  const d=await payload(req),username=str(d,'username',3,24),name=str(d,'display_name',1,50),password=str(d,'password',8,128);
  if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)||!['reader','writer'].includes(d.role))failure(400,'บัญชีหรือบทบาทไม่ถูกต้อง');
  let r;try{r=await run(db,'INSERT INTO users(username,display_name,passhash,role,created_at) VALUES(?,?,?,?,?)',username,name,await passwordHash(password),d.role,clock());}catch(e){if(/UNIQUE/i.test(String(e)))failure(409,'ชื่อผู้ใช้ซ้ำ');throw e;}
  return reply({ok:true},201,{'set-cookie':await session(db,r.meta.last_row_id)});
 }
 if(p==='/api/login'&&m==='POST'){
  const d=await payload(req),username=str(d,'username',1,24),password=str(d,'password',1,128);
  const user=await query(db,'SELECT * FROM users WHERE username=?',username);
  if(!user||!(await matches(password,user.passhash)))failure(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  return reply({ok:true},200,{'set-cookie':await session(db,user.id)});
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
  const user=await identity(db,req),{c,n,owner}=await chapter(db,integer(x[1]),user);
  if(user)await run(db,'INSERT INTO progress(user_id,novel_id,chapter_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,novel_id) DO UPDATE SET chapter_id=excluded.chapter_id,updated_at=excluded.updated_at',user.id,n.id,c.id,clock());
  const chapters=await rows(db,'SELECT id,title,position FROM chapters WHERE novel_id=? '+(owner?'':'AND published=1 ')+'ORDER BY position',n.id);
  return reply({chapter:c,novel:{id:n.id,title:n.title},chapters});
 }
 if(m==='GET'&&(x=p.match(/^\/api\/chapters\/(\d+)\/comments$/))){
  const user=await identity(db,req);await chapter(db,integer(x[1]),user);
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
  if(!['GET','POST','PUT'].includes(m))return reply({detail:'Method not allowed'},405,{allow:'GET, POST, PUT'});
  if(m!=='GET'){
   const origin=req.headers.get('origin');
   if(origin!==null&&origin!==url.origin)return reply({detail:'Forbidden origin'},403);
   if(req.headers.get('sec-fetch-site')==='cross-site')return reply({detail:'Forbidden site'},403);
  }
  try{return await api(req,env);}catch(e){const status=Number.isInteger(e.status)?e.status:500;if(status===500)console.error('API failure',String(e));return reply({detail:status===500?'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์':e.message},status);}
 }
 if(!['GET','HEAD'].includes(m))return new Response('Method not allowed',{status:405});
 if(!env.ASSETS)return new Response('Missing static assets binding',{status:503});
 return env.ASSETS.fetch(req);
}};