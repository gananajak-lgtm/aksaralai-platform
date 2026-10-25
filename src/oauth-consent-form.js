const escapeHtml=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export function renderBoundConsentForm(approved,nonce){
 if(!approved?.ok||typeof approved.display_name!=='string'||typeof approved.redirect_uri!=='string'||typeof nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(nonce))throw new TypeError('Invalid consent form input');
 const fields=['response_type','client_id','redirect_uri','code_challenge','code_challenge_method','scope','state'];
 if(fields.some(k=>typeof approved[k]!=='string'||!approved[k]))throw new TypeError('Incomplete OAuth authorization request');
 const hidden=fields.map(k=>'<input type="hidden" name="'+k+'" value="'+escapeHtml(approved[k])+'">').join('');
 return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>OAuth consent</title></head><body><h1>คำขอเชื่อมต่ออักษราลัย</h1><p>'+escapeHtml(approved.display_name)+'</p><p>novels:read — อ่านอย่างเดียว</p><p>'+escapeHtml(approved.redirect_uri)+'</p><form action="/api/oauth/consent" method="post"><input type="hidden" name="nonce" value="'+nonce+'">'+hidden+'<button name="decision" value="approve">อนุญาต</button><button name="decision" value="deny">ปฏิเสธ</button></form></body></html>';
}
