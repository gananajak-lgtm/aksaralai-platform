import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('AI rewrite accepts up to 40000 characters in server and editor',()=>{
 const start=server.indexOf("if(p==='/api/admin/rewrite-text'");
 const end=server.indexOf('// Admin AI Assistant',start);
 const route=server.slice(start,end);
 assert.match(route,/original.length>40000/);
 assert.match(route,/edited.length>80000/);
 assert.match(ui,/if\(original.length>40000\)\{status.textContent/);
 assert.match(ui,/แก้เนื้อหาได้ไม่เกิน 40,000 ตัวอักษร/);
});
test('AI paragraph formatter retains its separate 4500-character safety limit',()=>{
 const start=server.indexOf("if(p==='/api/admin/format-text'");
 const end=server.indexOf('// AI-assisted fiction rewrite',start);
 assert.match(server.slice(start,end),/original.length>4500/);
});
