import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {hashOAuthSecret,parseBearerAuthorization,authenticateOAuthBearer} from '../src/oauth-bearer.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const token='A'.repeat(43);
test('bearer parser accepts only strict bearer tokens',()=>{
 assert.equal(parseBearerAuthorization('Bearer '+token),token);
 for(const header of [null,'Basic '+token,'bearer '+token,'Bearer short','Bearer '+token+' extra','Bearer '+token+'\nX: injected'])assert.equal(parseBearerAuthorization(header),null);
});
test('hashing OAuth bearer token is deterministic and not plaintext',async()=>{
 const hash=await hashOAuthSecret(token);
 assert.match(hash,/^[a-f0-9]{64}$/);
 assert.equal(hash,await hashOAuthSecret(token));
 assert.notEqual(hash,token);
});
test('bearer authentication resolves only active read-only grant',async()=>{
 const expected=await hashOAuthSecret(token);
 let calls=0;
 const db={prepare(sql){assert.match(sql,/revoked_at IS NULL/);assert.match(sql,/expires_at>\?/);return {bind(hash,now){assert.equal(hash,expected);assert.equal(now,123);return {async first(){calls++;return {user_id:7,client_id:'client',scope:'novels:read'};}};}};}};
 assert.equal((await authenticateOAuthBearer(db,'Bearer '+token,123)).user_id,7);
 assert.equal(await authenticateOAuthBearer(db,'Basic '+token,123),null);
 assert.equal(calls,1);
});
test('bearer authentication rejects absent and non-read grants',async()=>{
 const db={prepare(){return {bind(){return {async first(){return {scope:'novels:write'};}};}};}};
 assert.equal(await authenticateOAuthBearer(db,'Bearer '+token,123),null);
});
