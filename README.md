# อักษราลัย (Aksaralai) 📚

เว็บไซต์ PWA สำหรับอ่านและเขียนนิยายภาษาไทย มีบัญชีนักอ่านและนักเขียนแยกบทบาท ใช้ **Cloudflare Workers + D1** เป็น Backend และฐานข้อมูลส่วนกลาง พร้อม Web Speech API สำหรับอ่านออกเสียงภาษาไทยตามความสามารถของอุปกรณ์

## สิ่งที่มีใน GitHub แล้ว

- `public/index.html` — เว็บแอปแบบ Responsive: สำรวจนิยาย, เข้าสู่ระบบ, ชั้นหนังสือ, หน้าตอน, สตูดิโอนักเขียน และเครื่องเล่นอ่านออกเสียง
- `public/sw.js`, `public/manifest.webmanifest` และไอคอน — โครงสร้าง PWA สำหรับเพิ่มลงหน้าจอหลัก
- `src/index.js` — API สมัครสมาชิก/ล็อกอิน/ล็อกเอาต์, สิทธิ์นักเขียน, CRUD นิยายและตอน, ฉบับร่าง/เผยแพร่, progress, shelves, comments
- `migrations/0001_initial.sql` — ฐานข้อมูล D1 เฉพาะอักษราลัย (ไม่ใช้ฐานข้อมูลพิภพเร้นลับ)
- `test/api.test.js` และ GitHub Actions CI — ชุดทดสอบ API และไวยากรณ์สคริปต์

## ทดลองบนเครื่องด้วย Node.js 22+

```bash
npm install
npm run db:local
npm run dev
npm test
```

เปิด URL ที่ Wrangler แสดงหลังรัน dev ได้เลย ตัวทดสอบใช้ in-memory SQLite mock ให้เสมือน D1; ควรทดสอบ integration บน D1 จริงก่อนใช้งานกับผู้ใช้ภายนอกด้วย

## ติดตั้ง Cloudflare (ยังไม่ได้ deploy)

1. ใช้ **บัญชี Cloudflare ของเจ้าของโปรเจกต์** โดยสร้าง Worker และฐานข้อมูลใหม่ ไม่แตะ resource ของพิภพเร้นลับ
2. `npx wrangler login`
3. `npx wrangler d1 create aksaralai-db`
4. นำ UUID ฐานข้อมูล **ใหม่** มาแทน `PLACEHOLDER_DATABASE_ID` ใน `wrangler.toml`
5. `npm run db:remote`
6. `npm run deploy`
7. เปิด HTTPS workers.dev URL ที่ CLI แสดง แล้วตรวจ PWA และเสียงอ่านบนมือถือจริง

อ่านเอกสาร Cloudflare: https://developers.cloudflare.com/workers/static-assets/ และ https://developers.cloudflare.com/d1/get-started/

**คำเตือน:** อย่าส่ง Cloudflare API token, password หรือค่า secret ให้ผู้อื่นทางแชท และห้ามใช้ database UUID ของพิภพเร้นลับในไฟล์นี้

## ข้อจำกัดก่อนเปิดให้คนทั่วไปสมัคร

แพลตฟอร์มนี้ยังเป็น MVP ไม่มี CAPTCHA/Turnstile, rate limits, email verification, password reset, ระบบรายงานหรือตรวจสอบเนื้อหา, การบล็อกบัญชี, เครื่องมือผู้ดูแล, นโยบายข้อมูลส่วนบุคคล และแผนสำรองข้อมูล โปรดอย่าเปิดรับข้อมูลบัญชีจริงเป็นวงกว้างก่อนปิดช่องว่างเหล่านี้

เสียงอ่านใช้ `speechSynthesis` ของเครื่องผู้ใช้ ไม่ใช่ API เสียง AI; อุปกรณ์บางรุ่นอาจไม่มีเสียงไทยหรือหยุดอ่านเมื่อพักหน้าจอ ระบบยังไม่มีเหรียญหรือการชำระเงินจริง

**สถานะ deployment:** Repo มีโค้ดและไฟล์ตั้งค่าพื้นฐานแล้ว แต่ยังไม่มี D1 UUID, ยังไม่ deploy และยังไม่มี URL สาธารณะ
