# RiskLedger — XAU & Oil Portfolio

เว็บแอปสำหรับบันทึกออเดอร์ XAUUSD และ Oil ที่ยังเปิดอยู่ คำนวณต้นทุนเฉลี่ย P/L, Equity และราคาล้างตามสูตรใน Excel รองรับทั้ง BUY, SELL, การปิดบางส่วน และประวัติการเพิ่ม/ถอนทุน พร้อมแบบจำลองทุนร่วม XAU + Oil เป็นผลเสริม

## ข้อมูลตั้งต้นจาก Excel

- ทุนเริ่มต้น: `$4,300`
- XAUUSD: 17 ออเดอร์ × 0.10 lot, ต้นทุนเฉลี่ย `4,797.993529`
- USOIL: 7 ออเดอร์ รวม 0.16 lot, ต้นทุนเฉลี่ย `97.406875`
- Contract size แบบล็อกตามไฟล์เดิม: XM GOLD Ultra Low Micro = `1` oz/lot, OIL/OILCash = `100` barrels/lot
- ราคาจำลองตั้งต้น: XAUUSD = `3,300`, USOIL = `60`

## วิธีคำนวณ

```text
BUY P/L  = (ราคาปัจจุบัน - ราคาเข้า) × Lot × Contract size
SELL P/L = (ราคาเข้า - ราคาปัจจุบัน) × Lot × Contract size
Equity   = Balance + Unrealized P/L

ราคาล้าง BUY  = ต้นทุนเฉลี่ย - Balance ÷ (Lot รวม × Contract size)
ราคาล้าง SELL = ต้นทุนเฉลี่ย + Balance ÷ (Lot รวม × Contract size)
```

ผลหลักคำนวณแต่ละ Position แยกกันตาม Excel โดยถือว่าทุนหมดเมื่อ Equity เท่ากับ `$0` และไม่นำ P/L ของอีกสินทรัพย์มาหักก่อน ค่าคงที่ของสัญญาและ Equity เป้าหมายแก้จากหน้าเว็บไม่ได้

ส่วน “แบบจำลองทุนร่วม” จะตรึงราคาของอีกสินทรัพย์ไว้ ณ ราคาปัจจุบัน แล้วหาราคาที่ทำให้ Equity รวมเท่ากับ `$0` ผลนี้แยกจากสูตร Excel อย่างชัดเจน และไม่ใช่ระดับ Stop-out จริงของโบรกเกอร์ เพราะยังไม่รวม used margin, spread และ swap

> Oil ในแอปหมายถึง OIL/OILCash ขนาด 100 barrels/lot ตามไฟล์นี้ ไม่ใช่ OILMn ซึ่งเป็นสัญญา Mini ขนาดต่างกัน

## การเก็บข้อมูล

ข้อมูลบันทึกใน IndexedDB ของเบราว์เซอร์และไม่ถูก reset เมื่อ reload หน้า รายการที่ปิดแล้วจะย้ายไปเป็นประวัติและ Realized P/L จะถูกนำไปคำนวณ Balance ต่อ

ควรกด **สำรองข้อมูล** เป็นไฟล์ JSON เป็นระยะ โดยเฉพาะก่อนล้างข้อมูลเบราว์เซอร์ เปลี่ยนเครื่อง หรือเปลี่ยน browser profile เพราะข้อมูลเวอร์ชันนี้อยู่เฉพาะในเบราว์เซอร์เครื่องนั้น

## เปิดใช้งานในเครื่อง

```bash
pnpm install
pnpm dev
```

ตรวจสูตรและ build:

```bash
pnpm test:calc
pnpm build
```

## ส่งขึ้น GitHub ผ่าน GitHub Desktop

1. เปิด GitHub Desktop แล้วเลือก **File → Add Local Repository**
2. เลือกโฟลเดอร์โปรเจกต์นี้
3. ตรวจรายการไฟล์ แล้ว commit ด้วยข้อความ เช่น `Initial RiskLedger app`
4. กด **Publish repository** เพื่อสร้าง repository บน GitHub

> หมายเหตุ: การ publish repository เป็นการเก็บ source code บน GitHub ยังไม่ใช่ฐานข้อมูลออนไลน์ข้ามอุปกรณ์ ถ้าต้องการใช้หลายเครื่องหรือหลายผู้ใช้ ควรเพิ่มระบบ sign-in และฐานข้อมูล server ในเวอร์ชันถัดไป
