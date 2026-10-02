# ItemMaster Auto Loader (iPBASS Scraper)

โฟลเดอร์นี้ได้รับการแยกส่วนเป็นแบบ **Standalone** สำหรับนำไปรันบนเครื่องอื่นได้ทันทีโดยไม่ต้องเชื่อมโยงกับโปรเจกต์เดิม

---

## 📂 โครงสร้างภายในโฟลเดอร์

```text
ItemMaster_Loader/
├── auto_load_item_master.py   # สคริปต์หลักรันการทำงาน (หลักสูตร OOP)
├── credentials.ini            # ไฟล์เก็บ Username/Password ของ iPBASS Portal (ห้ามนำขึ้น Git)
├── credentials.ini.example    # เทมเพลตตัวอย่างไฟล์คอนฟิก
└── requirements.txt           # รายการแพ็กเกจ Python ที่ต้องใช้สำหรับติดตั้ง (Dependencies)
```

---

## ⚙️ ขั้นตอนการเตรียมการก่อนรัน (Setup)

### 1. ติดตั้ง Python
ตรวจสอบให้มั่นใจว่าเครื่องปลายทางมีการติดตั้ง **Python 3.8 ขึ้นไป** แล้ว

### 2. ติดตั้ง Dependencies (Library ที่จำเป็น)
เปิด Terminal หรือ Command Prompt ในโฟลเดอร์นี้ แล้วรันคำสั่งติดตั้งไลบรารี:
```bash
pip install -r requirements.txt
```

### 3. ตั้งค่าบัญชีล็อกอิน
ตรวจสอบไฟล์ `credentials.ini` และใส่ข้อมูลล็อกอินของ Minebea iPBASS Portal:
```ini
[ipbass]
username = บัญชีผู้ใช้ (เช่น Bpp9596)
password = รหัสผ่าน (เช่น Q6qwertyuio)
```

---

## 🚀 วิธีการใช้งานและการรันคำสั่ง (CLI)

สคริปต์รองรับการทำงานหลักทั้งหมด 3 รูปแบบ ผ่าน Argument ดังนี้:

### 1. รันดึงข้อมูลทันทีครั้งเดียว (One-off Mode)
รันเพื่อดึงข้อมูลรหัสทั้ง 4 ช่วงทันที และบันทึกเป็นไฟล์ Excel ผลลัพธ์:
```bash
python auto_load_item_master.py
```
* **ผลลัพธ์**: ไฟล์ Excel จะเซฟลงโฟลเดอร์ `Raw_output_data` ในโฟลเดอร์เดียวกันนี้อัตโนมัติ โดยตั้งชื่อไฟล์เป็นระบบ `ItemMaster_Raw_{YYYYMMDD}_{HHMM}.xlsx` (เช่น `ItemMaster_Raw_20260701_1345.xlsx`)

### 2. โหมดตั้งเวลาวนรันทุกๆ N นาที (Interval Mode)
เช่น ต้องการให้สคริปต์รันตัวเองทุกๆ 15 นาที เพื่อตรวจสอบและอัปเดตข้อมูล:
```bash
python auto_load_item_master.py --interval 15
```
* สคริปต์จะค้างหน้าต่างไว้และรันงานใหม่ทุกๆ 15 นาที สามารถกด **Ctrl + C** เพื่อยกเลิก

### 3. โหมดรันรายวันตามเวลาที่กำหนด (Daily Mode)
เช่น ต้องการให้ระบบเริ่มดึงข้อมูลทุกๆ เช้า ณ เวลา 08:30 น. ของทุกวัน:
```bash
python auto_load_item_master.py --schedule 08:30
```
* หน้าต่างจะคำนวณเวลานอนหลับ (Sleep) และตื่นขึ้นมารันเองเมื่อถึงเวลาที่กำหนดในทุกๆ วัน

### 4. กำหนดโฟลเดอร์ปลายทางที่ต้องการเซฟผลลัพธ์เอง (Override Output Folder)
หากไม่ต้องการให้เซฟในโฟลเดอร์เริ่มต้น (`Raw_output_data`) สามารถชี้เป้าหมายไปไดรฟ์หรือโฟลเดอร์อื่นได้ เช่น:
```bash
python auto_load_item_master.py --output-dir "D:/PowerBI_Data/ItemMaster"
```
*(รองรับการผสานร่วมกับทั้งโหมด --interval และ --schedule ได้เช่นกัน)*
