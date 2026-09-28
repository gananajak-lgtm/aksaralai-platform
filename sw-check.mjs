import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if (!blocks.length) throw new Error('No inline script found');
for (const block of blocks) new vm.Script(block[1], { filename: 'public/index.html' });
new vm.Script(fs.readFileSync(new URL('./public/sw.js', import.meta.url),'utf8'), { filename: 'public/sw.js' });
console.log('Browser scripts parse successfully');
