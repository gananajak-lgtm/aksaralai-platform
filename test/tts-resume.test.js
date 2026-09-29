import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const a=html.indexOf('function splitText('),b=html.indexOf('\nasync function read(',a);
assert.ok(a>=0&&b>a,'speech controller must exist');
const speechCode=html.slice(a,b);
function storage(map){return {getItem(key){return map.has(key)?map.get(key):null;},setItem(key,value){map.set(key,String(value));},removeItem(key){map.delete(key);}};}
function harness(savedLocal,savedSession){
 const els=new Map(),spoken=[],events=new Map();
 function element(name){if(!els.has(name))els.set(name,{value:'',textContent:'',innerHTML:'',disabled:false,classList:{add(){},remove(){}},querySelectorAll(){return[];},querySelector(){return {classList:{add(){},remove(){}}};}});return els.get(name);}
 const engine={getVoices(){return[{name:'Thai',lang:'th-TH',voiceURI:'th-1'}];},cancel(){},pause(){},resume(){},speak(u){spoken.push(u);}};
 const context={localStorage:storage(savedLocal),sessionStorage:storage(savedSession),document:{getElementById:element},window:{speechSynthesis:engine,SpeechSynthesisUtterance:function(t){this.text=t;},addEventListener(event,callback){events.set(event,callback);},removeEventListener(event){events.delete(event);}},SpeechSynthesisUtterance:function(t){this.text=t;},audio:null,speed:1,esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');},toast(){},Set,JSON,Date};
 const initialize=vm.runInNewContext(speechCode+'\ninitializeAudio',context);
 return {initialize,els,spoken,events,context,engine};
}
test('checkpoint survives pagehide and reload, resumes second segment, restart clears it',()=>{
 const local=new Map(),session=new Map(),text='เสียงแรก! เสียงที่สอง? เสียงที่สาม!';
 const first=harness(local,session);first.initialize(text,42);
 assert.equal(first.els.get('speak').textContent,'▶ เริ่มฟัง');
 first.els.get('speak').onclick();
 assert.equal(first.spoken[0].text,'เสียงแรก!');
 first.spoken[0].onend();
 assert.equal(first.spoken[1].text.trim(),'เสียงที่สอง?');
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.42')).index,1);
 first.events.get('pagehide')();first.context.audio.stop();
 const refreshed=harness(local,session);refreshed.initialize(text,42);
 assert.match(refreshed.els.get('speak').textContent,/ฟังต่อจากจุดเดิม/);
 refreshed.els.get('speak').onclick();
 assert.equal(refreshed.spoken[0].text.trim(),'เสียงที่สอง?');
 refreshed.els.get('restart-speech').onclick();
 assert.equal(refreshed.spoken[1].text,'เสียงแรก!');
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.42')).index,0);
});
test('checkpoints remain separate per chapter and reset after content changes',()=>{
 const local=new Map(),session=new Map();
 const first=harness(local,session);first.initialize('หนึ่ง! สอง?',8);first.els.get('speak').onclick();first.spoken[0].onend();
 const other=harness(local,session);other.initialize('อื่น! ใหม่?',9);assert.equal(other.els.get('speak').textContent,'▶ เริ่มฟัง');
 const changed=harness(local,session);changed.initialize('หนึ่ง! ถูกแก้?',8);assert.equal(changed.els.get('speak').textContent,'▶ เริ่มฟัง');
});
test('home exposes last listened chapter link and does not need login',()=>{
 assert.ok(html.includes('🎧 กลับไปฟังตอนล่าสุด'));
 assert.ok(html.includes('aksaralai.tts.last'));
});

test('Android pause and resume starts speaking again without relying on native resume',()=>{
 const local=new Map(),session=new Map();
 const h=harness(local,session);h.initialize('ช่วงที่หนึ่ง! ช่วงที่สอง? ช่วงที่สาม!',77);
 let cancels=0,resumes=0;
 h.engine.cancel=()=>{cancels++;};
 h.engine.resume=()=>{resumes++;};
 h.els.get('speak').onclick();
 h.spoken[0].onend();
 assert.equal(h.spoken[1].text.trim(),'ช่วงที่สอง?');
 h.els.get('speak').onclick();
 assert.match(h.els.get('speak').textContent,/ฟังต่อ/);
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.77')).index,1);
 const before=h.spoken.length;
 h.els.get('speak').onclick();
 assert.equal(h.spoken.length,before+1,'resume must start a new utterance');
 assert.equal(h.spoken.at(-1).text.trim(),'ช่วงที่สอง?');
 assert.equal(resumes,0,'native resume must not be required');
 assert.ok(cancels>=2);
 // A canceled utterance completing late must not skip any text.
 h.spoken[1].onend();
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.77')).index,1);
 h.spoken.at(-1).onend();
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.77')).index,2);
});
