const escapeHtml=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export function renderBoundConsentForm(approved,nonce){
 if(!approved?.ok||typeof approved.display_name!=='string'||typeof approved.redirect_uri!=='string'||typeof nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(nonce))throw new TypeError('Invalid consent form input');
 return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>OAuth consent</title></head><body><h1>คำขอเชื่อมต่ออักษราลัย</h1><p>'+escapeHtml(approved.display_name)+'</p><p>novels:read — อ่านอย่างเดียว</p><p>'+escapeHtml(approved.redirect_uri)+'</p><form action="/api/oauth/consent" method="post"><input type="hidden" name="nonce" value="'+nonce+'"><button name="decision" value="approve">อนุญาต</button><button name="decision" value="deny">ปฏิเสธ</button></form></body></html>';
}
