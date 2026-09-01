# RiskLedger — XAU & Oil Portfolio

เว็บแอปสำหรับบันทึกออเดอร์ XAUUSD และ Oil ที่ยังเปิดอยู่ คำนวณต้นทุนเฉลี่ย P/L, Equity และราคาล้างตามสูตรใน Excel รองรับ BUY, SELL, การปิดบางส่วน ฝาก ถอน ปรับยอด Balance และสมุดประวัติระยะยาว พร้อมแบบจำลองทุนร่วม XAU + Oil เป็นผลเสริม

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

ข้อมูลบันทึกใน IndexedDB ของเบราว์เซอร์และไม่ถูก reset เมื่อ reload หน้า รายการที่ปิดแล้วจะอยู่ในประวัติและ Realized P/L จะถูกนำไปคำนวณ Balance ต่อ

```text
Balance = ทุนตั้งต้น + ฝาก - ถอน + รายการปรับยอด + Realized P/L
```

- “ฝากเงิน” และ “ถอนเงิน” เป็น cash flow จริง โดยถอนเกิน Balance ไม่ได้
- “ปรับยอด Balance” เป็นรายการ `BALANCE_ADJUSTMENT` แยกจากฝาก/ถอน พร้อมยอดก่อนและหลัง
- ทุนตั้งต้นแก้ได้ก่อนมีประวัติ cash flow หรือปิดออเดอร์เท่านั้น หลังจากนั้นให้ใช้ “ปรับยอด Balance”
- ประวัติเต็มสามารถแก้หมายเหตุและย้อนรายการได้ การย้อนจะเก็บรายการเดิมไว้เป็น audit trail
- ไฟล์ข้อมูล version 1 จะถูกตรวจสอบและ migrate เป็น version 2 อัตโนมัติ ข้อมูลผิดรูปแบบจะไม่ถูกนำเข้าหรือเขียนทับข้อมูลเดิม
- ก่อน Import หรือก่อนรับ Cloud เวอร์ชันใหม่ ระบบเก็บ Recovery snapshot ใน IndexedDB สูงสุด 10 ชุด และกู้ชุดล่าสุดได้จากหน้าตั้งค่า

หากล็อกอิน Google ระบบจะเปรียบเทียบ `revision` และ `updatedAt` ก่อนเลือกข้อมูลในเครื่องหรือ Cloud ที่ใหม่กว่า และจะไม่เขียน echo จาก Realtime กลับขึ้น Cloud ซ้ำ ควรกด **สำรองข้อมูล** เป็น JSON เป็นระยะ โดยเฉพาะก่อนล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง

กฎ Firestore แบบเจ้าของอ่าน/เขียนได้คนเดียวอยู่ใน `firestore.rules` หลังเชื่อม Firebase CLI ให้ deploy ด้วย:

```bash
firebase deploy --only firestore:rules
```

## เชื่อมราคาตลาดปัจจุบัน

ระบบดึงราคาอ้างอิง `XAU/USD` spot และ `WTI/USD` spot จาก [Twelve Data](https://twelvedata.com/commodities) ผ่าน Cloudflare Worker โดยอัตโนมัติเมื่อเปิดหน้า และอัปเดตทุก 60 วินาที แอปไม่ใช้ PAXG/USDT แทน XAUUSD และจะไม่ใช้ราคา Oil เก่าปะปนกับข้อมูลสด

- เก็บ `TWELVE_DATA_API_KEY` เป็น Cloudflare Secret ห้ามใส่ API key ในหน้าเว็บ, source code หรือ GitHub
- หน้าเว็บใช้ endpoint `https://cal-risk-forex.chonnateefamilylove.workers.dev/api/prices` ที่กำหนดใน source และไม่มีช่องกรอก API key หรือ Proxy URL
- Worker จำกัด Origin, จำกัดประมาณ 12 requests/IP/นาที และ cache 30 วินาที
- ระบบดึงทั้ง XAU/USD และ WTI/USD พร้อมกันเมื่อกดอัปเดต หรือทุก 60 วินาทีเมื่อเปิด Auto
- ราคาที่ดึงได้จะถูกบันทึกเป็นราคาปัจจุบันในพอร์ตและใช้คำนวณ P/L, Equity และแบบจำลองทุนร่วม
- ราคา spot อาจต่างจาก Bid/Ask ของ XM เพราะ spread, feed และเวลาปรับราคาต่างกัน ควรตรวจราคาใน MT4/MT5 ก่อนใช้ตัดสินใจจริง

### ตั้งค่า Cloudflare Worker

1. สร้าง Worker แล้ววางโค้ดจาก `scripts/cloudflare-worker-template.js`
2. เพิ่ม Secret ชื่อ `TWELVE_DATA_API_KEY`
3. เพิ่ม Variable ชื่อ `ALLOWED_ORIGINS` ค่า `https://tinala-ct.github.io`
4. Deploy Worker แล้วเปิดหน้า RiskLedger ระบบจะดึงราคาล่าสุดทันที
5. หากต้องการทดสอบซ้ำ ให้กด **อัปเดตราคาตอนนี้** โดยไม่ต้องตั้งค่าบนหน้าเว็บ

Alpaca ไม่รองรับ `XAUUSD` และ `USOIL` โดยตรง ส่วน `GLD` และ `USO` เป็น ETF คนละหน่วยกับ spot/CFD จึงไม่นำมาใช้แทนราคาในสูตร

## เปิดใช้งานในเครื่อง

```bash
pnpm install
pnpm dev
```

ตรวจสูตรและ build:

```bash
pnpm test:calc
pnpm test:market
pnpm test:sync
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

## เปิดเป็น Web App ด้วย GitHub Pages

โปรเจกต์นี้ build เป็น Vite static site และมี GitHub Actions สำหรับเผยแพร่โฟลเดอร์ `dist` อัตโนมัติ

1. Commit และ Push การแก้ไขเข้า branch `main` ผ่าน GitHub Desktop
2. เปิด repository บน GitHub แล้วไปที่ **Settings → Pages**
3. ที่ **Build and deployment → Source** เลือก **GitHub Actions**
4. เปิดแท็บ **Actions** รอ workflow `Deploy GitHub Pages` สำเร็จ
5. เข้าเว็บที่ `https://tinala-ct.github.io/Cal-risk-Forex/`

> GitHub Pages และ repository นี้เป็น Public ข้อมูลตั้งต้นที่อยู่ใน source code จึงมองเห็นได้สาธารณะ ส่วนข้อมูลใหม่ที่เพิ่มผ่านหน้าเว็บจะอยู่ใน IndexedDB ของ browser เครื่องนั้น ควรส่งออก JSON สำรองเป็นระยะ
