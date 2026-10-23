import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyPkce,validatePkceChallenge,validatePkceVerifier,validateRedirectUri} from '../src/oauth-pkce.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
test('PKCE S256 RFC 7636 known vector',async()=>{
 const verifier='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
 const challenge='E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
 assert.equal(validatePkceVerifier(verifier),true);
 assert.equal(validatePkceChallenge(challenge,'S256'),true);
 assert.equal(await verifyPkce(verifier,challenge),true);
 assert.equal(await verifyPkce(verifier+'x',challenge),false);
});
test('PKCE rejects plain and malformed values',async()=>{
 assert.equal(validatePkceChallenge('abc','plain'),false);
 assert.equal(validatePkceVerifier('short'),false);
 assert.equal(await verifyPkce('short','invalid'),false);
});
test('OAuth redirect must exactly match a registered URI',()=>{
 const allow=['https://client.example/callback','http://127.0.0.1:8888/callback'];
 assert.equal(validateRedirectUri('https://client.example/callback',allow),true);
 assert.equal(validateRedirectUri('https://client.example/callback?next=evil',allow),false);
 assert.equal(validateRedirectUri('https://client.example.evil/callback',allow),false);
 assert.equal(validateRedirectUri('http://127.0.0.1:8888/callback',allow),true);
 assert.equal(validateRedirectUri('http://evil.example/callback',['http://evil.example/callback']),false);
});
