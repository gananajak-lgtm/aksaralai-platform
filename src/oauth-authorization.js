import {validatePkceChallenge,validateRedirectUri} from './oauth-pkce.js';

// Pure validation only. The server must authenticate the writer and display
// explicit consent before any authorization code is issued.
export function validateAuthorizationRequest(params,registeredClient) {
 if(!params||typeof params!=='object'||!registeredClient) return {ok:false,error:'invalid_request'};
 if(params.response_type!=='code')return {ok:false,error:'unsupported_response_type'};
 if(typeof params.client_id!=='string'||params.client_id!==registeredClient.client_id)return {ok:false,error:'invalid_client'};
 if(!validateRedirectUri(params.redirect_uri,registeredClient.redirect_uris))return {ok:false,error:'invalid_redirect_uri'};
 if(!validatePkceChallenge(params.code_challenge,params.code_challenge_method))return {ok:false,error:'invalid_request'};
 if(params.scope!=='novels:read')return {ok:false,error:'invalid_scope'};
 if(typeof params.state!=='string'||params.state.length<16||params.state.length>512||!/^[\x21-\x7E]+$/.test(params.state))return {ok:false,error:'invalid_request'};
 return {ok:true,client_id:params.client_id,redirect_uri:params.redirect_uri,code_challenge:params.code_challenge,scope:'novels:read',state:params.state};
}
export function buildAuthorizationRedirect(approved,code) {
 if(!approved?.ok||typeof code!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(code))throw new TypeError('Invalid authorization grant');
 const target=new URL(approved.redirect_uri);
 target.searchParams.set('code',code);
 target.searchParams.set('state',approved.state);
 return target.toString();
}
