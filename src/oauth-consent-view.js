// Server-rendered OAuth consent screen. No grant is issued by rendering.
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function renderOAuthConsent(approved) {
 if(!approved?.ok||typeof approved.display_name!=='string')throw new TypeError('Validated client required');
 const app=escapeHtml(approved.display_name);
 const callback=escapeHtml(approved.redirect_uri);
 return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>อนุญาตการเชื่อมต่อ — อักษราลัย</title><style>body{font-family:system-ui,sans-serif;max-width:540px;margin:8vh auto;padding:24px;line-height:1.65}main{border:1px solid #ddd;border-radius:16px;padding:28px}h1{font-size:1.5rem}small{overflow-wrap:anywhere;color:#555}.note{background:#f4f4f4;padding:12px;border-radius:8px}</style></head><body><main><h1>คำขอเชื่อมต่ออักษราลัย</h1><p><strong>${app}</strong> ขอสิทธิ์อ่านต้นฉบับนิยายในบัญชีของคุณ</p><p class="note">สิทธิ์ที่ร้องขอ: อ่านนิยาย (novels:read) เท่านั้น ไม่สามารถแก้ไขหรือลบต้นฉบับ</p><p>ปลายทางที่ลงทะเบียนไว้:</p><small>${callback}</small><p>การเปิดหน้านี้ยังไม่อนุญาตการเข้าถึง คุณต้องยืนยันสิทธิ์ด้วยตนเอง</p><p><strong>ยังไม่เปิดให้อนุญาตการเชื่อมต่อ</strong> ระบบออกโทเคนอยู่ระหว่างพัฒนา</p></main></body></html>`;
}
