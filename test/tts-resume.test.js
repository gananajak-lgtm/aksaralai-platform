import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const a=html.indexOf('function splitText('),b=html.indexOf('\nasync function read(',a);
assert.ok(a>=0&&b>a,'speech controller must exist');
const speechCode=html.slice(a,b);
function storage(map){return {getItem(key){return map.has(key)?map.get(key):null;},setItem(key,value){map.set(key,String(value));},removeItem(key){map.delete(key);}};}
function harness(savedLocal,savedSession,accountId=1){
 const els=new Map(),spoken=[],events=new Map(),timers=[];
 function element(name){if(!els.has(name))els.set(name,{value:'',textContent:'',innerHTML:'',disabled:false,classList:{add(){},remove(){}},querySelectorAll(){return[];},querySelector(){return {classList:{add(){},remove(){}}};}});return els.get(name);}
 const engine={getVoices(){return[{name:'Thai',lang:'th-TH',voiceURI:'th-1'}];},cancel(){},pause(){},resume(){},speak(u){spoken.push(u);}};
 const context={user:{id:accountId},localStorage:storage(savedLocal),sessionStorage:storage(savedSession),document:{getElementById:element},window:{speechSynthesis:engine,SpeechSynthesisUtterance:function(t){this.text=t;},addEventListener(event,callback){events.set(event,callback);},removeEventListener(event){events.delete(event);}},SpeechSynthesisUtterance:function(t){this.text=t;},audio:null,speed:1,esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');},toast(){},setTimeout(fn){timers.push(fn);},Set,JSON,Date};
 const initialize=vm.runInNewContext(speechCode+'\ninitializeAudio',context);
 return {initialize,els,spoken,events,context,engine,flush(){while(timers.length)timers.shift()();}};
}
test('checkpoint survives pagehide and reload, resumes second segment, restart clears it',()=>{
 const local=new Map(),session=new Map(),text='เสียงแรก!\nเสียงที่สอง?\nเสียงที่สาม!';
 const first=harness(local,session);first.initialize(text,42);
 assert.equal(first.els.get('speak').textContent,'▶ เริ่มฟัง');
 first.els.get('speak').onclick();first.flush();
 assert.equal(first.spoken[0].text,'เสียงแรก');
 first.spoken[0].onend();first.flush();
 assert.equal(first.spoken[1].text.trim(),'เสียงที่สอง');
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.1.chapter.42')).index,1);
 first.events.get('pagehide')();first.context.audio.stop();
 const refreshed=harness(local,session);refreshed.initialize(text,42);
 assert.match(refreshed.els.get('speak').textContent,/ฟังต่อจากจุดเดิม/);
 refreshed.els.get('speak').onclick();refreshed.flush();
 assert.equal(refreshed.spoken[0].text.trim(),'เสียงที่สอง');
 refreshed.els.get('restart-speech').onclick();refreshed.flush();
 assert.equal(refreshed.spoken[1].text,'เสียงแรก');
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.1.chapter.42')).index,0);
});
test('checkpoints remain separate per chapter and reset after content changes',()=>{
 const local=new Map(),session=new Map();
 const first=harness(local,session);first.initialize('หนึ่ง! สอง?',8);first.els.get('speak').onclick();first.flush();first.spoken[0].onend();
 const other=harness(local,session);other.initialize('อื่น! ใหม่?',9);assert.equal(other.els.get('speak').textContent,'▶ เริ่มฟัง');
 const changed=harness(local,session);changed.initialize('หนึ่ง! ถูกแก้?',8);assert.equal(changed.els.get('speak').textContent,'▶ เริ่มฟัง');
});
test('home exposes a per-account last listened chapter link',()=>{
 assert.ok(html.includes('🎧 กลับไปฟังตอนล่าสุด'));
 assert.ok(html.includes('aksaralai.tts.last.user.'));
});

test('Android pause and resume starts speaking again without relying on native resume',()=>{
 const local=new Map(),session=new Map();
 const h=harness(local,session);h.initialize('ช่วงที่หนึ่ง!\nช่วงที่สอง?\nช่วงที่สาม!',77);
 let cancels=0,resumes=0;
 h.engine.cancel=()=>{cancels++;};
 h.engine.resume=()=>{resumes++;};
 h.els.get('speak').onclick();h.flush();
 h.spoken[0].onend();h.flush();
 assert.equal(h.spoken[1].text.trim(),'ช่วงที่สอง');
 h.els.get('speak').onclick();
 assert.match(h.els.get('speak').textContent,/ฟังต่อ/);
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.1.chapter.77')).index,1);
 const before=h.spoken.length;
 h.els.get('speak').onclick();h.flush();
 assert.equal(h.spoken.length,before+1,'resume must start a new utterance');
 assert.equal(h.spoken.at(-1).text.trim(),'ช่วงที่สอง');
 assert.equal(resumes,0,'native resume must not be required');
 assert.ok(cancels>=2);
 // A canceled utterance completing late must not skip any text.
 h.spoken[1].onend();
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.1.chapter.77')).index,1);
 h.spoken.at(-1).onend();
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.1.chapter.77')).index,2);
});

test('Android restart does not speak before its canceled queue settles',()=>{
 const h=harness(new Map(),new Map());h.initialize('คำแรก! คำถัดไป?',21);
 h.els.get('speak').onclick();
 assert.equal(h.spoken.length,0,'engine queue must drain before first speak');
 h.flush();assert.equal(h.spoken.length,1);
 h.els.get('speak').onclick(); // pause + cancel
 h.els.get('speak').onclick(); // resume schedules a fresh chunk
 assert.equal(h.spoken.length,1,'do not speak synchronously after cancel');
 h.flush();assert.equal(h.spoken.length,2);
 h.els.get('restart-speech').onclick();
 assert.equal(h.spoken.length,2);
 h.flush();assert.equal(h.spoken.length,3);
});

test('onboundary saves speech offset and resume reads from that word, not chapter start',()=>{
 const local=new Map(),session=new Map();
 const h=harness(local,session),body='เรื่องราวตอนต้นที่กำลังอ่านและยังไม่จบประโยค';
 h.initialize(body,123);
 h.els.get('speak').onclick();h.flush();
 assert.equal(h.spoken[0].text,body);
 h.spoken[0].onboundary({charIndex:14});
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.1.chapter.123')).offset,14);
 h.els.get('speak').onclick();
 h.els.get('speak').onclick();h.flush();
 assert.equal(h.spoken.at(-1).text,body.slice(14));
 const reloaded=harness(local,session);reloaded.initialize(body,123);
 reloaded.els.get('speak').onclick();reloaded.flush();
 assert.equal(reloaded.spoken[0].text,body.slice(14));
});
test('long unpunctuated text is split into brief checkpoints on Thai speech engines without boundaries',()=>{
 const h=harness(new Map(),new Map()),body='ตัวอักษร'.repeat(70);
 const chunks=vm.runInNewContext(speechCode+'\nsplitText',h.context)(body);
 assert.ok(chunks.length>=2);
 assert.ok(chunks.every(x=>x.length<=220),'Thai words should be grouped into longer natural phrases');
 assert.equal(chunks.join(''),body);
});

test('Thai segmentation preserves complete wording without splitting inside segmented words',()=>{
 const ctx=harness(new Map(),new Map()).context;
 const split=vm.runInNewContext(speechCode+'\nsplitText',ctx);
 const body='อาณาจักรโบราณยามราตรีมีเสียงกระซิบแว่วจากป่าลึก'.repeat(5);
 const parts=split(body);
 assert.equal(parts.join(''),body);
 const seg=new Intl.Segmenter('th',{granularity:'word'});
 const positions=new Set([0]);let i=0;
 for(const word of seg.segment(body)){i+=word.segment.length;positions.add(i);}
 let cursor=0;for(const part of parts){cursor+=part.length;assert.ok(positions.has(cursor),'cut must occur at Thai word boundary');}
});
test('punctuation and quotes are silent while visual novel remains unchanged',()=>{
 const h=harness(new Map(),new Map());
 h.initialize('“เสียงลึกลับ…”',44);h.els.get('speak').onclick();h.flush();
 assert.equal(h.spoken[0].text,'เสียงลึกลับ');
 assert.ok(!h.spoken[0].onboundary,'normalized text must not store incorrect raw offsets');
 assert.equal(h.els.get('reading').innerHTML.includes('“เสียงลึกลับ…”'),true);
});

test('pronunciation glossary is local-only and affects speech, not displayed novel',()=>{
 const local=new Map(),session=new Map();
 const h=harness(local,session),body='พรานสิงห์เดินเข้าป่า!';
 h.initialize(body,55);
 h.els.get('pron-word').value='พรานสิงห์';
 h.els.get('pron-sound').value='พฺราน สิง';
 h.els.get('pron-add').onclick();
 assert.deepEqual(JSON.parse(local.get('aksaralai.tts.pronunciations')),[{word:'พรานสิงห์',sound:'พฺราน สิง'}]);
 h.els.get('speak').onclick();h.flush();
 assert.ok(h.spoken[0].text.startsWith('พฺราน สิง'));
 assert.ok(h.els.get('reading').innerHTML.includes('พรานสิงห์'));
});
test('longest pronunciation rule takes precedence without cascading substitutions',()=>{
 const h=harness(new Map(),new Map());
 const transform=vm.runInNewContext(speechCode+'\npronunciationText',h.context);
 const text=transform('ชาวอินทราวดีพบอิน',[
 {word:'อิน',sound:'อะ'},
 {word:'อินทราวดี',sound:'อิน-ทฺรา-วะ-ดี'},
 {word:'อะ',sound:'ไม่ควรแทนซ้ำ'}
 ]);
 assert.equal(text,'ชาวอิน-ทฺรา-วะ-ดีพบอะ');
});

test('Thai prose is not chopped at 64 characters when the sentence has natural pauses',()=>{
 const h=harness(new Map(),new Map());
 const split=vm.runInNewContext(speechCode+'\nsplitText',h.context);
 const body='เขาก้าวเข้าไปในป่าที่มืดสนิท โดยมีเสียงลมพัดผ่านใบไม้เบา ๆ ก่อนจะหยุดยืนเพื่อฟังเสียงเรียกจากที่ไกลออกไปและหันมามองผู้ร่วมทางด้วยความสงสัย';
 const parts=split(body);
 assert.equal(parts.length,1);assert.equal(parts[0],body);
});
test('paragraph breaks retain a pause before the next spoken chunk, without saying punctuation aloud',()=>{
 const h=harness(new Map(),new Map());
 const body='บรรทัดแรก\nบรรทัดที่สอง';
 h.initialize(body,202);
 h.els.get('speak').onclick();h.flush();
 assert.equal(h.spoken[0].text,'บรรทัดแรก');
 h.spoken[0].onend();
 assert.equal(h.spoken.length,1,'do not immediately read the next paragraph');
 h.flush();
 assert.equal(h.spoken[1].text,'บรรทัดที่สอง');
});

test('TTS sends letters and numbers only while visible manuscript keeps punctuation',()=>{
 const h=harness(new Map(),new Map());
 const speak=vm.runInNewContext(speechCode+'\nspeechText',h.context);
 assert.equal(speak('“สวัสดี!” — เขาพูด... (ครั้งที่ 2) #ทดสอบ'),'สวัสดี เขาพูด ครั้งที่ 2 ทดสอบ');
 assert.equal(speak('อวิ๋นเซิง: ไปไหม?'),'อวิ๋นเซิง ไปไหม');
 h.initialize('“อวิ๋นเซิง!” — ไปไหม?',77);
 h.els.get('speak').onclick();h.flush();
 assert.equal(h.spoken[0].text,'อวิ๋นเซิง ไปไหม');
 assert.ok(h.els.get('reading').innerHTML.includes('“อวิ๋นเซิง!” — ไปไหม?'));
});

test('Thai repetition mark is spoken as repeated word, not as mai yamok',()=>{
 const h=harness(new Map(),new Map());
 const speak=vm.runInNewContext(speechCode+'\nspeechText',h.context);
 assert.equal(speak('ช้าๆ'),'ช้า ช้า');
 assert.equal(speak('เบา ๆ'),'เบา เบา');
 assert.equal(speak('เดินช้าๆ'),'เดินช้า ช้า');
 assert.equal(speak('เดินเร็วๆ'),'เดินเร็ว เร็ว');
 assert.equal(speak('พูดเบาๆ ก่อนออกไป'),'พูดเบา เบา ก่อนออกไป');
});
test('TTS expands repetition while the displayed original preserves the mark',()=>{
 const h=harness(new Map(),new Map());
 h.initialize('เดินช้าๆ',299);
 h.els.get('speak').onclick();h.flush();
 assert.equal(h.spoken[0].text,'เดินช้า ช้า');
 assert.ok(h.els.get('reading').innerHTML.includes('เดินช้าๆ'));
 assert.ok(!h.spoken[0].onboundary,'changed speech text cannot reuse original offsets');
});

test('three logged-in users do not inherit each others TTS resume position on one device',()=>{
 const local=new Map(),session=new Map();
 const body='บทแรก!\nบทสอง?\nบทสาม!';
 const first=harness(local,session,1);
 first.initialize(body,42);
 first.els.get('speak').onclick();first.flush();
 first.spoken[0].onend();first.flush();
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.1.chapter.42')).index,1);
 const second=harness(local,session,2);
 second.initialize(body,42);
 assert.equal(second.els.get('speak').textContent,'▶ เริ่มฟัง');
 second.els.get('speak').onclick();second.flush();
 assert.equal(second.spoken[0].text,'บทแรก');
 second.spoken[0].onend();second.flush();
 second.spoken[1].onend();second.flush();
 assert.equal(JSON.parse(local.get('aksaralai.tts.chapter.user.2.chapter.42')).index,2);
 const third=harness(local,session,3);
 third.initialize(body,42);
 assert.equal(third.els.get('speak').textContent,'▶ เริ่มฟัง');
 third.els.get('speak').onclick();third.flush();
 assert.equal(third.spoken[0].text,'บทแรก');
 const firstAgain=harness(local,session,1);
 firstAgain.initialize(body,42);
 firstAgain.els.get('speak').onclick();firstAgain.flush();
 assert.equal(firstAgain.spoken[0].text.trim(),'บทสอง');
});

