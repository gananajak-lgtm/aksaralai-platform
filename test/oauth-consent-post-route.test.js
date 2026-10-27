import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOAuthConsentDenial} from '../src/oauth-consent-route.js';
const params={response_type:'code',client_id:'app',redirect_uri:'https://client.example/callback',code_challenge:'A'.repeat(43),code_challenge_method:'S256',scope:'novels:read',state:'s'.repeat(20)};
const request=(data,origin='https://aksaralai.example')=>new Request('https://aksaralai.example/api/oauth/consent',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
const db={prepare(){throw Error('Unexpected DB query');}};
test('cross-origin consent is rejected before database access',async()=>{
 const response=await handleOAuthConsentDenial(db,request({...params,nonce:'A'.repeat(43),decision:'deny'},'https://evil.example'),{writerId:1,sessionTokenHash:'a'.repeat(64),now:100});
 assert.equal(response.status,403);
});
test('duplicate fields and oversized form are rejected before database access',async()=>{
 const form=new URLSearchParams({...params,nonce:'A'.repeat(43),decision:'deny'});
 form.append('decision','approve');
 const duplicate=new Request('https://aksaralai.example/api/oauth/consent',{method:'POST',headers:{origin:'https://aksaralai.example','content-type':'application/x-www-form-urlencoded'},body:form});
 assert.equal((await handleOAuthConsentDenial(db,duplicate,{writerId:1,sessionTokenHash:'a'.repeat(64),now:100})).status,400);
 const oversized=request({...params,nonce:'A'.repeat(43),decision:'deny',extra:'x'.repeat(9000)});
 assert.equal((await handleOAuthConsentDenial(db,oversized,{writerId:1,sessionTokenHash:'a'.repeat(64),now:100})).status,413);
});
