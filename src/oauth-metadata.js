// OAuth 2.0 Authorization Server Metadata for the read-only MCP connector.
// Public-client registration is deliberately manual: never accept arbitrary redirect URIs.
export function oauthMetadata(request){
 const url=new URL(request.url);
 const origin=url.origin;
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))
  return new Response('HTTPS required',{status:400});
 const data={
  issuer:origin,
  authorization_endpoint:origin+'/api/oauth/authorize',
  token_endpoint:origin+'/api/oauth/token',
  response_types_supported:['code'],
  grant_types_supported:['authorization_code'],
  code_challenge_methods_supported:['S256'],
  token_endpoint_auth_methods_supported:['none'],
  scopes_supported:['novels:read']
 };
 return new Response(JSON.stringify(data),{status:200,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300',
  'x-content-type-options':'nosniff','access-control-allow-origin':'*'
 }});
}
export function protectedResourceMetadata(request){
 const origin=new URL(request.url).origin;
 return new Response(JSON.stringify({
  resource:origin+'/api/mcp',
  authorization_servers:[origin],
  scopes_supported:['novels:read'],
  bearer_methods_supported:['header']
 }),{status:200,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300',
  'x-content-type-options':'nosniff','access-control-allow-origin':'*'
 }});
}
