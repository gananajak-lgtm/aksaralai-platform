import {hashOAuthSecret} from './oauth-bearer.js';
import {redeemReadOnlyGrant} from './oauth-token-issuance.js';
import {validateRedirectUri,validatePkceVerifier} from './oauth-pkce.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff'}});
const error=(code,status=400)=>json({error:code},status);
export async function handleOAuthToken(db,request,{now}){
 if(request.method!=='POST')return error('invalid_request',405);
 const type=request.headers.get('content-type')||'';
 if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(type))return error('invalid_request',415);
 if(Number(request.headers.get('content-length')||0)>8192)return error('invalid_request',413);
 const body=await request.text();
 if(new TextEncoder().encode(body).length>8192)return error('invalid_request',413);
 const pairs=[...new URLSearchParams(body)];
 const keys=pairs.map(([k])=>k);
 const expected=['grant_type','code','redirect_uri','client_id','code_verifier'];
 if(keys.length!==expected.length||new Set(keys).size!==keys.length||keys.some(k=>!expected.includes(k)))return error('invalid_request');
 const form=Object.fromEntries(pairs);
 if(form.grant_type!=='authorization_code')return error('unsupported_grant_type');
 if(!/^[A-Za-z0-9_-]{43}$/.test(form.code)||!validatePkceVerifier(form.code_verifier)||
    typeof form.client_id!=='string'||form.client_id.length<1||form.client_id.length>200)return error('invalid_grant');
 const client=await db.prepare('SELECT client_id,redirect_uris_json FROM oauth_clients WHERE client_id=?').bind(form.client_id).first();
 if(!client)return error('invalid_client',401);
 let allowlist;try{allowlist=JSON.parse(client.redirect_uris_json)}catch{return error('invalid_client',401)}
 if(!validateRedirectUri(form.redirect_uri,allowlist))return error('invalid_grant');
 const token=await redeemReadOnlyGrant(db,{codeHash:await hashOAuthSecret(form.code),clientId:form.client_id,redirectUri:form.redirect_uri,verifier:form.code_verifier},now);
 if(!token)return error('invalid_grant');
 return json(token);
}
