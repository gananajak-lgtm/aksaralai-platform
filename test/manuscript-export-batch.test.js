import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocx} from '../src/manuscript-export.js';

test('DOCX export tolerates an empty chapter body among ten chapters',async()=>{
 const chapters=Array.from({length:10},(_,i)=>({position:i+1,title:'ตอนที่ '+(i+1),body:i===5?null:'ข้อความภาษาไทย\nบทสนทนา'}));
 const doc=makeDocx('นิยายทดสอบ',chapters);
 assert.equal(doc.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 const bytes=new Uint8Array(await doc.arrayBuffer());
 assert.equal(String.fromCharCode(...bytes.slice(0,4)),'PK\x03\x04');
 assert.ok(bytes.length>500);
});
test('DOCX export can handle ten long Thai chapters',async()=>{
 const chapters=Array.from({length:10},(_,i)=>({position:i+1,title:'ตอน '+(i+1),body:'เนื้อเรื่องภาษาไทย'.repeat(1000)}));
 const doc=makeDocx('นิยายยาว',chapters);
 assert.ok(doc.size>100000);
});
