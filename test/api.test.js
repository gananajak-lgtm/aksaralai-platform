import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 return {prepare(sql){let args=[];const p=sqlite.prepare(sql);return {bind(...v){args=v;return this},async first(){return p.get(...args)||null},async all(){return {results:p.all(...args)}},async run(){const r=p.run(...args);return {meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)}}}}}};
}
function harness(){
 const env={DB:database(),ASSETS:{fetch:async()=>new Response('asset')}};let cookie='';
 return {async api(path,method='GET',data,headers={}){
  const req=new Request('https://example.com/api'+path,{method,headers:{...(method==='GET'?{}:{'content-type':'application/json','origin':'https://example.com'}),...(cookie?{cookie}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  const res=await worker.fetch(req,env);if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,...await res.json()};
 },getCookie(){return cookie;},setCookie(s){cookie=s;},clear(){cookie='';}};
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
