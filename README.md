# WashQ — ระบบจองคิวเครื่องซักผ้า

มินิโปรเจกต์หน้าเดียว ต่อยอดจาก Clinic App: เลือกเครื่อง 3 เครื่อง จองรอบละ 1 ชั่วโมง และยกเลิกโดยเก็บประวัติไว้ในตารางเดียวกัน

## การใช้งาน

1. เลือกเครื่อง 01 (9 กก.), 02 (12 กก.) หรือ 03 (15 กก.)
2. กรอกชื่อ เลือกวันที่และรอบ 08:00–19:00 น. (รอบสุดท้ายสิ้นสุด 20:00 น.)
3. กดยืนยันการจอง รายการจะแสดงในตาราง
4. กด Cancel และยืนยัน ระบบเปลี่ยนสถานะเป็น `cancelled` และบันทึกเวลายกเลิก
5. รายการเดิมยังอยู่ และสามารถจองเครื่อง/รอบเดิมใหม่ได้

เวลาบนหน้าเว็บเป็นเวลาไทย (Asia/Bangkok) เสมอ ฐานข้อมูลเก็บ UTC ไม่อนุญาตจองย้อนหลังหรือจองเครื่องเดียวกันในรอบเดียวกัน การจองพร้อมกันป้องกันด้วย unique filtered index ใน SQL Server

ระบบนี้ใช้สาธิตในชั้นเรียน ไม่มีล็อกอิน ทุกคนเห็นชื่อและรายการจองร่วมกัน และยกเลิกรายการได้ ใช้ชื่อทดสอบ ไม่ใช่ข้อมูลส่วนตัวจริง ไม่มีระบบชำระเงินหรือควบคุมเครื่องซักผ้าจริง

## รันบนเครื่อง (Node.js 22 หรือ 24)

เปิด Terminal ที่โฟลเดอร์โปรเจกต์:

```powershell
cd server
npm ci
# ทำบรรทัดถัดไปเฉพาะเมื่อยังไม่มี .env เท่านั้น
Copy-Item .env.example .env
```

ใส่ `AZURE_SQL_CONNECTION_STRING` ใน `server/.env` ด้วยค่าของคุณ ห้าม commit ไฟล์นี้ หากใช้ Azure SQL เครื่องของคุณต้องเชื่อมต่อผ่าน firewall ที่อนุญาต IP ของคุณด้วย

```powershell
npm run dev
```

เปิด Terminal อีกหน้าต่าง:

```powershell
cd web
npm ci
npm run dev
```

เปิด http://localhost:5173 หน้าเว็บเรียก API ผ่าน Vite proxy ไป localhost:8080

## ฐานข้อมูล

ใช้ Azure SQL เดิมผ่าน `AZURE_SQL_CONNECTION_STRING` ตารางใหม่ชื่อ `laundry_machines` และ `laundry_bookings` ข้อมูลคลินิกใน `doctors` / `appointments` ไม่ถูกแปลงหรือลบทิ้ง

API จะรัน `server/sql/laundry.sql` เมื่อมีคำขอข้อมูลครั้งแรก สคริปต์ทำซ้ำได้และสร้างเครื่องตัวอย่างเฉพาะรายการที่ยังไม่มี จึงไม่ต้องส่งรหัสผ่านผ่าน GitHub หรือตั้ง secret ใหม่ บัญชีฐานข้อมูลต้องมีสิทธิ์สร้างตาราง/ดัชนี หากบัญชีแอปไม่มีสิทธิ์ ให้เจ้าของฐานข้อมูลรันไฟล์นี้ใน Azure SQL Query editor ก่อน

`db/schema.sql` และ `db/seed-data.sql` เป็นไฟล์คลินิกเดิม เก็บไว้เพื่ออ้างอิง ไม่ต้องรันสำหรับ WashQ

## API

| Method | Path | ผลลัพธ์ |
|---|---|---|
| GET | `/` | Health: `washq-api` |
| GET | `/machines` | เครื่องซักผ้า |
| GET | `/bookings` | รายการจองรวมประวัติยกเลิก |
| POST | `/bookings` | สร้างการจอง (201), ซ้ำคืน 409 |
| PATCH | `/bookings/:id/cancel` | เปลี่ยนสถานะและเก็บเวลายกเลิก กดซ้ำไม่เปลี่ยนเวลาเดิม |

ตัวอย่าง body สำหรับจอง: `{"machine_id":1,"customer_name":"ทดสอบ","date":"2030-01-02","hour":10}` ใช้วันเวลาในอนาคต ทุกชั่วโมงอิงเวลาไทย

## ทดสอบ

```powershell
cd server
npm test
cd ../web
npm run build
```

Unit/API tests ใช้ store จำลอง ตรวจ validation, จองซ้ำ, ยกเลิกและจองใหม่โดยประวัติไม่หาย CI `Verify WashQ` ทดสอบ SQL Server จริงใน container ชั่วคราว รวมการจองพร้อมกันสองคำขอและการรัน schema ซ้ำ รหัสผ่านที่อยู่ใน workflow นั้นใช้เฉพาะ container ชั่วคราว ไม่มีข้อมูล Azure จริง

การทดสอบด้วย SQL จะข้ามเมื่อไม่มี `WASHQ_TEST_SQL` ห้ามตั้งตัวแปรนี้ให้ชี้ฐานข้อมูลใช้งานจริง

## Deploy

ใช้ Azure App Services และ GitHub Actions เดิม เมื่อ merge เข้า main จะ deploy frontend/API โดยชื่อ Azure resource ยังเป็น `app-clinicapp-web-66020600` และ `app-clinicapp-api-66020600` ไม่ต้องสร้างบริการเพิ่ม

Frontend build รับ `VITE_API_BASE` จาก workflow และใช้ PM2 serve ไฟล์ static บน Azure ขั้นตรวจหลัง deploy ตรวจหน้าเว็บล่าสุด API เครื่อง/การจอง และ CORS

หลังอัปเดตจาก GitHub บนเครื่องผู้ใช้:

```powershell
git pull --ff-only origin main
cd server
npm ci
npm test
cd ../web
npm ci
npm run build
```

เปิดเว็บแล้วทดสอบด้วยชื่อ `TEST WASHQ`: จอง → ลองจองรอบซ้ำ → ยกเลิก → รายการยังอยู่และมีเวลายกเลิก → จองรอบเดิมใหม่ → รีเฟรชแล้วข้อมูลยังคงอยู่
