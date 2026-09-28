# อักษราลัย (Aksaralai)

แพลตฟอร์มอ่านและเขียนนิยายภาษาไทย รองรับสมาชิกหลายบัญชี ระบบอ่านออกเสียงภาษาไทย และการติดตั้งเว็บลงหน้าจอหลัก (PWA)

## สถานะงาน (MVP 0.4)

- ต้นแบบฉบับ Cloudflare Workers + D1 ทำเสร็จแล้วในแพ็กเกจ ZIP ที่ส่งในแชท
- Repo นี้เริ่มมีไฟล์กำหนดโฮสต์ `wrangler.toml`, คำสั่งใน `package.json`, และสคีมาฐานข้อมูล `migrations/0001_initial.sql`
- **ยังไม่ได้ใส่ไฟล์ `src/index.js` และ `public/` จาก ZIP ลง Repo นี้** โปรเจกต์ใน GitHub จึงยัง deploy ไม่ได้จนกว่าจะนำไฟล์ที่เหลือเข้ามา
- ยังไม่มี Cloudflare D1 ID หรือเว็บไซต์สาธารณะ และยังไม่เปิดรับสมาชิกจริง

## นำไฟล์เข้า Repository

แตกไฟล์แพ็กเกจ `aksaralai-cloudflare-pwa-v0.4.zip` ที่ได้รับจากแชท แล้วนำเนื้อหาด้านในทั้งหมดเข้า Repo นี้ โดยรักษาโฟลเดอร์ `src/`, `public/`, `migrations/` ตามเดิม และเลือกแทนไฟล์ซ้ำตามเวอร์ชันใน ZIP

## Deploy หลังจากโค้ดครบ

1. ติดตั้ง Node.js และรัน `npm install`
2. เข้า Cloudflare ผ่าน `npx wrangler login`
3. สร้าง D1 แยกต่างหาก: `npx wrangler d1 create aksaralai-db`
4. คัดลอก `database_id` ที่ได้มาแทน `PLACEHOLDER_DATABASE_ID` ใน `wrangler.toml`
5. รัน `npm run db:remote` เพื่อสร้างตาราง
6. รัน `npm run deploy` และตรวจหน้าเว็บผ่าน HTTPS ของ Cloudflare

**ห้ามนำ UUID ของฐานข้อมูลพิภพเร้นลับมาใช้** และห้ามใส่ API token, รหัสผ่าน หรือ secrets ไว้ใน GitHub

## ก่อนเปิดให้บุคคลทั่วไปใช้

ต้องเสริม rate limiting, CAPTCHA / Turnstile, ระบบรีเซ็ตรหัสผ่าน, ตรวจสอบอีเมล, รายงานเนื้อหา, สำรองฐานข้อมูล และตรวจสอบ deployment จริงก่อนเปิดรับสมาชิก
