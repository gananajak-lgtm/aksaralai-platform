import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOAuthConsent} from '../src/oauth-consent-view.js';

test('consent preview shows read-only permission and no active approval',()=>{
 const html=renderOAuthConsent({ok:true,display_name:'ChatGPT',redirect_uri:'https://example.com/callback'});
 assert.match(html,/novels:read/);
 assert.match(html,/ยังไม่เปิดให้อนุญาต/);
 assert.doesNotMatch(html,/<form|<button/i);
 assert.match(html,/name="referrer" content="no-referrer"/);
});
test('consent preview escapes untrusted client name and callback',()=>{
 const html=renderOAuthConsent({ok:true,display_name:'<script>alert(1)</script>',redirect_uri:'https://example.com/?x="<img src=x>'});
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&quot;&lt;img/);
});
test('consent preview refuses unvalidated requests',()=>{
 assert.throws(()=>renderOAuthConsent({ok:false,display_name:'X'}),TypeError);
});
