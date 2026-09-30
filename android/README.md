# อักษราลัย Android (APK ทดสอบ)

แอป Android นี้เป็น WebView ที่แสดงเว็บไซต์อักษราลัย production เดิม:
`https://aksaralai-platform.gananajak.workers.dev/`

- ใช้บัญชีและข้อมูลชุดเดิมใน Cloudflare Workers + D1 + R2 ไม่ฝังข้อมูลลับ/API key ใน APK
- รองรับ JavaScript, cookies/login, หน้าจออ่าน/เขียน, เลือกไฟล์ MP3 จาก Android เพื่ออัปโหลด, ฟังเสียง HTML5
- ปุ่ม AI เฉพาะ admin ยังคงตรวจสิทธิ์ที่ backend ฝั่ง Cloudflare
- ดาวน์โหลด MP3 แบบ `blob:` จากหน้าสตูดิโอ OpenAI ผ่าน Android MediaStore (Android 10+) ไปที่ Downloads/Aksaralai
- ลิงก์อื่นนอกโดเมนเดิมเปิดในเบราว์เซอร์หรือแอปภายนอก

## การสร้าง APK

เปิด GitHub → Actions → `Build Aksaralai Android APK` → Run workflow (หรือรอการรันเมื่อ push/merge ไฟล์ android) → ดาวน์โหลด artifact ชื่อ `aksaralai-android-debug-apk` → แตก ZIP → `app-debug.apk` → ติดตั้งบน Android

นี่คือ **debug APK สำหรับทดสอบ**, ไม่ใช่ production-signed APK สำหรับจำหน่าย/Play Store. หากจะจำหน่ายหรืออัปเดตในระยะยาวต้องจัดการ signing key แบบคงที่ (และเก็บ secret อย่างปลอดภัย), versionCode, app privacy disclosure, release test และขั้นตอนเผยแพร่

## สิ่งที่ยังไม่รับประกัน

- WebView อาจถูก Android หยุดเมื่อแอปเข้า background/ล็อกหน้าจอ; MP3 มีการเรียก HTML5 media แต่การเล่นพื้นหลังอย่างต่อเนื่องยังต้องทดสอบบนเครื่องจริงและอาจต้องพัฒนาระบบ MediaSession/foreground media playback ใน Native Android.
- โปรแกรม AI Voice Studio ที่ติดตั้งบน Windows ผ่าน http://127.0.0.1:8765/ **ไม่ได้รันบนมือถือ**; ปุ่มนั้นเป็นเพียง launcher บนเครื่องที่ติดตั้งโปรแกรมเดิม.
- ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดเว็บไซต์; APK ไม่ใช่เซิร์ฟเวอร์หรือโมเดล AI แบบ offline.
- เวอร์ชันทดสอบฝัง URL production ที่กำหนดไว้ข้างต้น; ถ้าเปลี่ยนโดเมนจะต้อง rebuild APK.
