import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=html.indexOf('function aksaralaiPauseSettings()');
const end=html.indexOf('// Reader-controlled pronunciation replacements',start);
assert.ok(start>=0&&end>start,'pause controller source must exist');
const code=html.slice(start,end);
function setup(saved){
 const store=new Map(saved?Object.entries(saved):[]);
 const nodes=new Map();
 function node(id){
  if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}});
  return nodes.get(id);
 }
 const ctx={localStorage:{getItem(k){return store.get(k)||null;},setItem(k,v){store.set(k,String(v));}},
  document:{getElementById:node},expandThaiRepeats:s=>s};
 vm.runInNewContext(code,ctx);
 return {ctx,node,store};
}
test('pause controls initialize with defaults and persist independent changes',()=>{
 const h=setup();
 h.ctx.bindPauseSettings();
 assert.equal(h.node('pause-space-value').textContent,'0.3 วินาที');
 assert.equal(h.node('pause-speaker-value').textContent,'1.0 วินาที');
 h.node('pause-space-plus').onclick();
 h.node('pause-speaker-minus').onclick();
 assert.equal(h.node('pause-space-value').textContent,'0.4 วินาที');
 assert.equal(h.node('pause-speaker-value').textContent,'0.9 วินาที');
 const restored=setup(Object.fromEntries(h.store));
 restored.ctx.bindPauseSettings();
 assert.equal(restored.node('pause-space').value,'4');
 assert.equal(restored.node('pause-speaker').value,'9');
});
test('adjusted timing is encoded only as private-use pause markers',()=>{
 const h=setup();
 h.ctx.bindPauseSettings();
 h.node('pause-space').value='5';h.node('pause-space').handlers.input();
 h.node('pause-speaker').value='15';h.node('pause-speaker').handlers.input();
 const text=h.ctx.speechControlText('สวัสดี โลก [ตัวละคร] พูด');
 assert.ok(text.includes('\\uE000P500\\uE001'));
 assert.ok(text.includes('\\uE000P1500\\uE001'));
 assert.ok(!text.includes('P300')&&!text.includes('P1000'));
});
test('zero pauses, bounds, and malformed saved settings are safe',()=>{
 const h=setup({'aksaralai.tts.pause.settings':JSON.stringify({space:-500,speaker:99000})});
 h.ctx.bindPauseSettings();
 assert.equal(h.node('pause-space').value,'0');
 assert.equal(h.node('pause-speaker').value,'50');
 h.node('pause-speaker').value='0';h.node('pause-speaker').handlers.input();
 assert.equal(h.ctx.aksaralaiPauseSettings().speaker,0);
 assert.equal(h.ctx.aksaralaiPauseSettings().space,0);
});
