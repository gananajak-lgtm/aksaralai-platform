import {validateAuthorizationRequest} from './oauth-authorization.js';
import {resolveOAuthClient} from './oauth-client.js';

export async function prepareOAuthConsent(db,params,options) {
 if(!params||typeof params!=='object')return {ok:false,error:'invalid_request'};
 const id=params.client_id;
 if(typeof id!=='string'||id.length<1||id.length>200)return {ok:false,error:'invalid_client'};
 const record=await resolveOAuthClient(db,id,options);
 if(!record)return {ok:false,error:'invalid_client'};
 let uris;
 try{uris=JSON.parse(record.redirect_uris_json);}catch{return {ok:false,error:'invalid_client'};}
 if(!Array.isArray(uris)||uris.length===0||uris.some(x=>typeof x!=='string'))return {ok:false,error:'invalid_client'};
 const checked=validateAuthorizationRequest(params,{client_id:record.client_id,redirect_uris:uris});
 if(!checked.ok)return checked;
 return {...checked,display_name:record.display_name};
}

