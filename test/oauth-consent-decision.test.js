import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConsentDecisionRedirect} from '../src/oauth-consent-decision.js';
const approved={ok:true,redirect_uri:'https://client.example/callback?existing=yes',state:'s'.repeat(20)};
test('explicit denial returns access_denied and preserves state without a code',()=>{
 const url=new URL(buildConsentDecisionRedirect(approved,'deny'));
 assert.equal(url.searchParams.get('error'),'access_denied');
 assert.equal(url.searchParams.get('state'),approved.state);
 assert.equal(url.searchParams.get('code'),null);
 assert.equal(url.searchParams.get('existing'),'yes');
});
test('approval requires a valid code and preserves OAuth state',()=>{
 const url=new URL(buildConsentDecisionRedirect(approved,'approve','a'.repeat(43)));
 assert.equal(url.searchParams.get('code'),'a'.repeat(43));
 assert.equal(url.searchParams.get('state'),approved.state);
 assert.equal(url.searchParams.get('error'),null);
});
test('denial cannot include a code; invalid decisions are rejected',()=>{
 assert.throws(()=>buildConsentDecisionRedirect(approved,'deny','a'.repeat(43)),TypeError);
 assert.throws(()=>buildConsentDecisionRedirect(approved,'approve'),TypeError);
 assert.throws(()=>buildConsentDecisionRedirect(approved,'other'),TypeError);
});
test('unvalidated, unsafe and conflicting callback URLs are rejected',()=>{
 assert.throws(()=>buildConsentDecisionRedirect({...approved,ok:false},'deny'),TypeError);
 assert.throws(()=>buildConsentDecisionRedirect({...approved,redirect_uri:'https://client.example/cb?code=old'},'deny'),TypeError);
 assert.throws(()=>buildConsentDecisionRedirect({...approved,redirect_uri:'https://client.example/cb#fragment'},'deny'),TypeError);
 assert.throws(()=>buildConsentDecisionRedirect({...approved,redirect_uri:'http://remote.example/cb'},'deny'),TypeError);
});
