import test from 'node:test';
import assert from 'node:assert/strict';
import {issueAuthorizationCode} from '../src/oauth-code-issuance.js';
import {hashOAuthSecret} from '../src/oauth-bearer.js';
const approved={ok:true,client_id:'registered-client',redirect_uri:'https://client.example/callback',code_challenge:'A'.repeat(43),scope:'novels:read'};
test('authorization code is persisted only as a SHA-256 hash with five-minute expiry',async()=>{
 const code='Z'.repeat(43);let values;
 const db={prepare(sql){assert.match(sql,/INSERT INTO oauth_authorization_codes/);return {bind(...args){values=args;return {run:async()=>({meta:{changes:1}})};}}}};
 assert.equal(await issueAuthorizationCode(db,{approved,userId:8,now:1000,generateSecret:()=>code}),code);
 assert.equal(values[0],await hashOAuthSecret(code));
 assert.notEqual(values[0],code);
 assert.deepEqual(values.slice(1),['registered-client',8,'https://client.example/callback','A'.repeat(43),'novels:read',1300,1000]);
});
test('invalid scope or failed database insert never returns an authorization code',async()=>{
 const db={prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})}}}}};
 await assert.rejects(issueAuthorizationCode(db,{approved,userId:8,now:1000,generateSecret:()=> 'Z'.repeat(43)}),/not stored/);
 await assert.rejects(issueAuthorizationCode(db,{approved:{...approved,scope:'novels:write'},userId:8,now:1000,generateSecret:()=> 'Z'.repeat(43)}),TypeError);
});
