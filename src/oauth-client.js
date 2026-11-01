// Only OpenAI-hosted CIMD documents are eligible. Never fetch arbitrary client URLs.
const trustedId=/^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,128}\/)?client\.json$/;
const maxBytes=16384;
async function readMetadata(response){
 if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))return null;
 if(Number(response.headers.get('content-length'))>maxBytes)return null;
 const reader=response.body?.getReader();
 if(!reader)return null;
 const chunks=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();return null;}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function resolveOAuthClient(db,id,{fetchMetadata=fetch}={}){
 if(typeof id!=='string'||id.length<1||id.length>200)return null;
 if(!trustedId.test(id)){
  // Other identities retain manual registration; none triggers a remote fetch.
  return db.prepare('SELECT client_id,display_name,redirect_uris_json FROM oauth_clients WHERE client_id=?').bind(id).first();
 }
 try{
  const response=await fetchMetadata(id,{redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});
  const doc=await readMetadata(response);
  if(!doc||doc.client_id!==id||!Array.isArray(doc.redirect_uris)||doc.redirect_uris.length<1||doc.redirect_uris.length>10)return null;
  const methods=doc.token_endpoint_auth_methods_supported??[doc.token_endpoint_auth_method];
  if(!Array.isArray(methods)||!methods.includes('none'))return null;
  for(const uri of doc.redirect_uris){
   if(typeof uri!=='string'||uri.length>2048)return null;
   const url=new URL(uri);
   if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||url.port||url.username||url.password||url.hash||url.search)return null;
   if(url.pathname!=='/connector_platform_oauth_redirect'&&!/^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname))return null;
  }
  const record={client_id:id,display_name:'ChatGPT — OpenAI',redirect_uris_json:JSON.stringify(doc.redirect_uris)};
  // Grants reference oauth_clients. Persist only metadata fetched and validated above.
  await db.prepare('INSERT INTO oauth_clients(client_id,display_name,redirect_uris_json,created_at) VALUES(?,?,?,?) ON CONFLICT(client_id) DO UPDATE SET display_name=excluded.display_name,redirect_uris_json=excluded.redirect_uris_json')
   .bind(id,record.display_name,record.redirect_uris_json,Math.floor(Date.now()/1000)).run();
  return record;
 }catch{return null;}
}
