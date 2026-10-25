import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBoundConsentForm} from '../src/oauth-consent-form.js';
const valid={ok:true,display_name:'Client',redirect_uri:'https://client.example/callback'};
test('bound consent form requires a valid nonce and offers explicit decisions',()=>{
 const html=renderBoundConsentForm(valid,'A'.repeat(43));
 assert.match(html,/method="post"/);
 assert.match(html,/name="nonce"/);
 assert.match(html,/value="approve"/);
 assert.match(html,/value="deny"/);
 assert.match(html,/novels:read/);
 assert.throws(()=>renderBoundConsentForm(valid,'short'),TypeError);
 assert.throws(()=>renderBoundConsentForm({...valid,ok:false},'A'.repeat(43)),TypeError);
});
test('client-supplied display name and redirect are escaped',()=>{
 const html=renderBoundConsentForm({...valid,display_name:'<script>x</script>',redirect_uri:'https://client.example/?q="<img>'},'A'.repeat(43));
 assert.doesNotMatch(html,/<script>|<img>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&quot;&lt;img&gt;/);
});
