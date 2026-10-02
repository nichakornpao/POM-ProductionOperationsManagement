# 💻 Frontend Developer Manual — Indirect-Expense

> **Last updated:** 12 Mar 2026  
> เอกสารฉบับนี้จัดทำเพื่อช่วยให้ Developer ระบบ Frontend ทำความเข้าใจโครงสร้าง สถาปัตยกรรม และการทำงานของระบบ **Indirect-Expense** (ระบบจัดการเบิก Tooling) อย่างละเอียด

---

## สารบัญ (Table of Contents)

1. [Tech Stack](#-1-tech-stack)
2. [โครงสร้างโปรเจกต์ (Project Structure)](#-2-โครงสร้างโปรเจกต์-project-structure)
3. [Environment Configuration](#-3-environment-configuration)
4. [การแพ็คเกจและการเริ่มพัฒนา (Setup & Run)](#-4-การแพ็คเกจและการเริ่มพัฒนา-setup--run)
5. [UI Libraries & Theme](#-5-ui-libraries--theme)
6. [Architecture — Page & Component Pattern](#-6-architecture--page--component-pattern)
7. [Service & HTTP Client (การต่อ API)](#-7-service--http-client-การต่อ-api)
8. [Routing Structure](#-8-routing-structure)
9. [การจัดการ State & Real-time (Socket.io)](#-9-การจัดการ-state--real-time-socketio)
10. [แนวทางการเขียนแอปและตัวอย่างโค้ด](#-10-แนวทางการเขียนแอปและตัวอย่างโค้ด)
11. [ข้อควรระวังใน Frontend](#-11-ข้อควรระวังใน-frontend)

---

## 🛠️ 1. Tech Stack

| หมวด | เทคโนโลยี | เวอร์ชัน | หน้าที่ |
|------|-----------|---------|--------|
| Framework | **Angular** | v18.2.13 | Framework หลักสำหรับวาดหน้าจอ |
| Language | **TypeScript** | v5.5.2 | ภาษาหลักที่ใช้พัฒนา (Strict Typing) |
| Styling Core | **Bootstrap** | v5.3.7 | ระบบ Grid และ Utility CSS หลัก |
| UI Components | **PrimeNG** / **Angular Material** | v18 / v18 | ชุด UI สำเร็จรูป เช่น Table, Dialog |
| Table Data | **AG Grid Angular** | v34.2.0 | ตารางจัดการข้อมูลแบบขั้นสูง (Sort, Filter, Edit) |
| Charts & Graphs| **Chart.js** / **Highcharts** / **Ngx-Charts** | – | วาดกราฟหน้า Analyze Dashboard |
| Alert/Dialog | **SweetAlert2** | v11.6.13 | Pop-up ซ้อนทับสำหรับการยืนยันและแจ้งเตือน (Success/Error) |
| Real-time | **Socket.io-client** | v4.8.1 | รับ Notification จาก Backend แบบเรียลไทม์ |
| Export | **ExcelJS** / **File-Saver** / **HTML2Canvas**| – | การสร้างไฟล์ Excel และ Export หน้าจอออกมา |

---

## 📂 2. โครงสร้างโปรเจกต์ (Project Structure)

ระบบใช้โครงสร้างมาตรฐานของ Angular CLI (Standalone Components)

```text
Frontend/
├── package.json               # ⬅ Dependencies & Scripts สำหรับ npm
├── angular.json               # ⬅ การตั้งค่า Build และ Assets ของ Angular
├── tsconfig.json              # ⬅ การตั้งค่า TypeScript
│
└── src/
    ├── index.html             # ⬅ ไฟล์ HTML เริ่มต้น (จุดโหลด App)
    ├── styles.scss            # ⬅ Global Styles & Theme Variables นำเข้า Bootstrap/Material
    ├── main.ts                # ⬅ Bootstrap point เรียกการทำงานของ Application
    │
    └── app/
        ├── app.routes.ts      # ⬅ Route สำหรับนำทางทุกหน้าในระบบ (Router)
        ├── app.component.ts   # ⬅ Component หลักสุด (ครอบทั้งหมด)
        ├── app.config.ts      # ⬅ ตั้งค่า Providers, HTTP Client, Animations
        │
        ├── core/              # ⬅ สิ่งที่เรียกใช้ทั้งแอป (Services, Utils)
        │   ├── guards/        # ⬅ Route Guards สำหรับเช็คสิทธิ์แบบ Route-level
        │   ├── interceptors/  # ⬅ ตัวดักจับ HTTP Request (เช่น แนบ Token)
        │   ├── services/      # ⬅ ไฟล์ติดต่อกับ Backend (API Services - มีหลายไฟล์)
        │   └── utils/         # ⬅ ฟังก์ชัน Helper ทั่วไป
        │
        ├── components/        # ⬅ Reusable UI (นำไปใช้ซ้ำหลายๆ หน้า)
        │   └── ... (เช่น Header, Sidebar, Loading Spinner)
        │
        └── pages/             # ⬅ Feature Modules (หน้าจอต่างๆ แบ่งตาม Module)
            ├── login/         # ⬅ หน้า Login
            ├── PC/            # ⬅ หน้าสำหรับแผนก PC Plan
            ├── purchase/      # ⬅ หน้าสำหรับแผนกจัดซื้อ (หน้า Detail Purchase, History)
            └── user/          # ⬅ หน้าของฝั่ง Production (Cart, Send Request)
```

---

## 🌐 3. Environment Configuration

แม้จะเป็น Frontend แต่มีการเรียกใช้ API Endpoint ที่ต่างกันตาม Server Environment ปกติ Angular เก็บไว้ในโฟลเดอร์ \`src/environments/\` (ถ้ามี) หรือกำหนดใน \`services/\` เลย

### URL ของ Backend (สิ่งสำคัญมาก)

โดยปกติแล้ว Frontend จะเรียก API ตรงไปยัง \`<http://localhost:3000/api\`> (หรือ IP / URL ของเซิฟเวอร์จริงตอน Build)

วิธีแก้ปัญหาหาก \`Backend Request\` ไม่ทะลุ:

- ตรวจสอบไฟล์ \`proxy.conf.json\` (ถ้ามีการทิ้งโค้ดไว้เพื่อบายพาสรันเทส)
- ตรวจสอบ URL ที่เขียน hardcode ไว้ในไฟล์บริการต่างๆ แถบ \`src/app/core/services/\` (เช่น \`environment.apiUrl\`)

---

## 🚀 4. การแพ็คเกจและการเริ่มพัฒนา (Setup & Run)

เปิด Terminal แล้วเข้าไปที่โฟลเดอร์ \`Frontend\`

### 4.1 ติดตั้ง Node Modules

```bash
npm install
```

### 4.2 รัน Development Server (โหมดนักพัฒนา)

```bash
npm start
# หรือ
ng serve
```

หลังจากเซิร์ฟเวอร์รันเรียบร้อย ให้เปิด Browser ไปที่ \`<http://localhost:4200/\`>
*ระบบมี Hot-reload ถ้ามีการแก้ไฟล์จะอัพเดทหน้าจออัตโนมัติ*

### 4.3 การ Build ขึ้น Production

```bash
npm run build
# หรือ
ng build
```

ไฟล์บิลด์ทั้งหมดจะถูกสร้างขึ้นไปวางในโฟลเดอร์ \`dist/frontend/browser/\` ซึ่งคุณสามารถนำไปวางใน Root ของ Web Server (เช่น IIS, Nginx, Apache) ได้เลย

---

## 🎨 5. UI Libraries & Theme

Frontend นำสไตล์หลักมาจาก **Bootstrap** ควบคู่กับระบบ Component ขั้นสูง

1. **SCSS Global (\`styles.scss\`)**:
   ไฟล์นี้จะใช้ตั้งค่าตัวแปร CSS และการนำเข้า CSS Libraries (เช่น primeicons, ng-select css) รวมถึงตัวปรับแต่งตาราง (AG Grid theme)
2. **การวาด Component**:
   ใน HTML ให้เน้นใช้ Bootstrap classes อย่าง \`container, row, col, d-flex, mb-3, btn\` เพื่อสอดคล้องกับมาตรฐาน
3. **SweetAlert2**:
   เรียกใช้ใน Component ผ่าน \`Swal.fire()\` สำหรับ popup ถามว่า "แน่ใจหรือไม่ที่จะส่งเบิก?" ควบคู่กับการทำ Error alert เมื่อ Backend ตอบ 500 หรือ 400.

---

## 🏗️ 6. Architecture — Page & Component Pattern

แอปฯ ถูกเขียนด้วย **Angular 18 Standalone Component** Pattern โดยไม่ต้องพึ่งพา \`app.module.ts\` อีกต่อไป
แต่ละไฟล์ \`.component.ts\` จะจัดการตัวเอง:

```typescript
@Component({
  selector: 'app-user-cart',
  standalone: true,  // <-- แนวคิดใหม่ของ Angular
  imports: [CommonModule, FormsModule, AgGridModule, SweetAlert2Module],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent implements OnInit { ... }
```

### การทำ Data Flow (Data Binding)

- **จาก TS ไป HTML**: \`{{ variableName }}\`
- **ใส่ค่าลงตัวแปร 2 ทาง (Two-way)**: \`[(ngModel)]="myValue"\`
- **ผูกข้อมูลทางเดียว**: \`[disabled]="isBusy"\`
- **รับ Action (Event)**: \`(click)="onSubmit()"\`

---

## 🔌 7. Service & HTTP Client (การต่อ API)

ระบบแยกส่วนการเรียก Backend ยัดลงไปใน **Service (\`src/app/core/services/\`)**

ตัวอย่างขั้นตอนของ **Request Lifecycle**:

1. User กดปุ่มใน \`detailcasesetup.component.html\`
2. ทริกเกอร์ฟังก์ชันใน \`detailcasesetup.component.ts\`
3. Component จะเรียกใช้ \`this.purchaseService.updateStatus(payload)\`
4. \`purchaseService\` ยิง \`HttpClient.post('<http://localhost:3000/api/Update_Status_Purchase>', payload)\`
5. รอรับ HTTP Status กลับมา
6. (ถ้า 200 OK) Component สั่งให้ \`Swal.fire('Success')\` แล้ว Refresh Grid ข้อมูลใหม่

### ตัวอย่างการเขียน Service (\`src/app/core/services/api.service.ts\`)

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PurchaseApiService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api';

  // ส่งเบิก (POST)
  sendRequest(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/Send_Request`, data);
  }

  // ดึงรายการประวัติ (GET)
  getHistory(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/Purchase_History`);
  }
}
```

---

## 🗺️ 8. Routing Structure

Routing ของ Angular กำหนดไว้ที่ไฟล์ **\`src/app/app.routes.ts\`** มีการแบ่งโซนเด่นชัด:

```typescript
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { 
    path: 'purchase', // หน้าหลักของจัดซื้อ
    children: [
      { path: 'detail', component: DetailPurchaseComponent },
      { path: 'history', component: HistoryPurchaseComponent },
      { path: 'analyze', component: AnalyzeComponent }
    ]
  },
  {
    path: 'user', // หน้าหลักของพนักงาน
    children: [
      { path: 'cart', component: CartComponent },
      { path: 'request', component: SendRequestComponent }
    ]
  }
];
```

---

## 🔔 9. การจัดการ State & Real-time (Socket.io)

### Socket.io Lifecycle ในฝั่ง Frontend

Backend จะสั่งส่ง Signal เข้ามา แจ้งว่า "มี Request เบิกใหม่"
Frontend ใช้ \`SocketIoModule\` หรือสร้าง \`SocketService\` ดักฟัง:

```typescript
// ใน core/services/socket.service.ts
import { io } from 'socket.io-client';

export class SocketService {
  private socket = io('http://localhost:3000'); // เชื่อมต่อไป backend

  listenToNotification(callback: (data: any) => void) {
    this.socket.on('notification', (payload) => {
      // payload = { type: 'REQUEST_SENT', message: '...' }
      callback(payload);
    });
  }
}
```

หากมี Event \`notification\` ทริกเกอร์มา, Frontend จะเด้งไอคอนลูกน้ำกระดิ่ง หรือสแน็กบาร์ว่า "มีงานเข้า 1 รายการ"

---

## 👨‍💻 10. แนวทางการเขียนแอปและตัวอย่างโค้ด (AG Grid)

ส่วนมากของโปรเจกต์จะใช้ **AG Grid** ยัดตรงหน้าจอหลักเพื่อความสามารถตารางที่สมบูรณ์แบบ
วิธีการใช้คร่าวๆ :

**HTML:**

```html
<ag-grid-angular
  style="width: 100%; height: 500px;"
  class="ag-theme-alpine"
  [rowData]="purchaseList"
  [columnDefs]="colDefs"
  (gridReady)="onGridReady($event)">
</ag-grid-angular>
```

**TypeScript:**

```typescript
import { ColDef, GridReadyEvent } from 'ag-grid-community';

export class MyListComponent {
  purchaseList: any[] = []; // รับข้อมูลจาก Backend

  colDefs: ColDef[] = [
    { field: 'ID_Request', headerName: 'ID', sortable: true, filter: true },
    { field: 'ItemNo', headerName: 'Item Number' },
    { 
      field: 'Status',
      cellRenderer: (params: any) => {
        // วาด Custom HTML หากตรงกับเงื่อนไข
        return params.value === 'Complete' 
           ? '<span class="badge bg-success">Complete</span>' 
           : '<span class="badge bg-warning">Waiting</span>';
      }
    }
  ];
  
  onGridReady(params: GridReadyEvent) {
    // ปรับให้ตาราง Fit กับหน้าจอ
    params.api.sizeColumnsToFit();
  }
}
```

---

## ⛔ 11. ข้อควรระวังและ Tips สู่ Frontend Team

1. โครงสร้างข้อมูลที่ไม่ตรงกัน
   หมั่นตรวจสอบ Array Mapping โดย Angular ใช้ TypeScript (Strict Type) ขณะที่ Backend มัก Response ออกมาเป็น Object / Array JSON ดิบ หากพิมพ์ผิด 1 ตัว (เช่น \`itemNo\` บน Component แต่ดันเป็น \`ItemNo\` จาก SQL Database) จะทำให้แสดงผล Error ตกขอบ
2. Angular RxJS Subscriptions
   เมื่อคุณเรียก \`.subscribe()\` ใน Component จำไว้เสมอว่าให้ \`Unsubscribe\` หากหน้าจอนั้นถูกทำลาย (Destroy) มิฉะนั้นจะเกิด Memory Leak โดยการใช้ Async Pipe \`| async\` ใน HTML ถือเป็นวิธีที่ดีที่สุด
3. การปรับสถานะ Component และ DOM
   ไม่ควรไปยุ่งกับคำสั่งดึง DOM แบบ jQuery ธรรมดา (เช่น \`document.getElementById\`) ควรใช้การซ่อนแสดงผ่าน \`*ngIf\` และคำสั่งของ Angular ควบคุม
