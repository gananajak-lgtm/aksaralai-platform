import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const start=source.indexOf("if(p==='/api/oauth/authorize'&&m==='GET')");
const block=source.slice(start,source.indexOf("if(p==='/api/register'",start));
test('OAuth consent preview is disabled by default and requires writer session',()=>{
 assert.ok(start>0);
 assert.match(block,/AKSARALAI_OAUTH_PREVIEW_ENABLED/);
 assert.match(block,/await author\(db,req\)/);
 assert.ok(block.indexOf('const writer=await author(db,req)')<block.indexOf('prepareOAuthConsent'));
});
test('OAuth consent preview checks registration and never issues grants',()=>{
 assert.match(block,/await prepareOAuthConsent\(db,params\)/);
 assert.match(block,/renderOAuthConsent\(approved\)/);
 assert.doesNotMatch(block,/INSERT INTO oauth_|buildAuthorizationRedirect|oauth_access_tokens/);
});
test('OAuth consent preview has restrictive browser security headers',()=>{
 assert.match(block,/content-security-policy/);
 assert.match(block,/frame-ancestors 'none'/);
 assert.match(block,/referrer-policy':'no-referrer'/);
 assert.match(block,/cache-control':'no-store'/);
});

test('OAuth preview rejects duplicate query parameters before validation',()=>{
 assert.match(block,/\[\.\.\.u\.searchParams\.keys\(\)\]\.length!==Object\.keys\(params\)\.length/);
 assert.match(block,/failure\(400,'Duplicate OAuth parameter'\)/);
 assert.ok(block.indexOf('Duplicate OAuth parameter')<block.indexOf('prepareOAuthConsent(db,params)'));
});

test('consent form is independently gated and nonce is bound to writer session',()=>{
 assert.match(block,/AKSARALAI_OAUTH_CONSENT_FORM_ENABLED/);
 assert.match(block,/generateConsentNonce\(\)/);
 assert.match(block,/hashConsentNonce\(nonce\)/);
 assert.match(block,/hashConsentContext\(approved,writer.id,await sha\(sessionToken\)\)/);
 assert.match(block,/storeBoundConsent\(db,/);
 assert.match(block,/expiresAt:now\+300/);
 assert.match(block,/renderBoundConsentForm\(approved,nonce\)/);
});
