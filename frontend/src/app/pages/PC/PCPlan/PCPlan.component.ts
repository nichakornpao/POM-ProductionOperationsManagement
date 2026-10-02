import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { SidebarComponent } from '../../../components/sidebar/sidebar.component';
import { PCPlanService } from '../../../core/services/PCPlan.service';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import Swal from 'sweetalert2';
import { environment } from '../../../../environments/environment';

import { NgSelectModule } from '@ng-select/ng-select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule, MAT_DATE_LOCALE, DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { CustomDateAdapter } from '../../../core/utils/custom-date-adapter';
import { NotificationComponent } from '../../../components/notification/notification.component';
import { NotificationService } from '../../../core/services/notification.service';
import { forkJoin, of, timer } from 'rxjs';

export interface PlanItem {
  uniqueId?: string;        // PLAN-{uuid} — generated at download, carried through upload
  date: string | Date | null;
  machineType: string | null;
  fac: string | null;
  mcNo: string;
  process: string | null;
  partBef: string | null;
  partNo: string | null;
  barType: string | null;
  qty: number | null;
  time: string;
  mcQty?: number | null;
  comment: string;
  revision?: number;
  groupId?: string;
  checked?: boolean;
}

export const MY_DATE_FORMATS = {
  parse: {
    dateInput: 'DD/MM/YYYY',
  },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

@Component({
  selector: 'app-pc-plan',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarComponent,
    NgSelectModule,
    MatDatepickerModule,
    MatInputModule,
    MatNativeDateModule,
    NotificationComponent
  ],
  providers: [
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS }
  ],
  templateUrl: './PCPlan.component.html',
  styleUrls: ['./PCPlan.component.scss']
})

export class PCPlanComponent implements OnInit {

  // --- ตัวแปรสำหรับ Dropdown ---
  divisionOptions: { code: string, label: string, profitCenter: string }[] = [];
  selectedDivisionCode: string = '';

  // ลิสต์ตัวเลือก (สำหรับ Dropdown ในตาราง)
  machineTypes: string[] = [];
  facs: any[] = [];
  processes: string[] = [];
  partNos: string[] = [];
  partBef: string[] = [];

  // ข้อมูลในตาราง (Main Data)
  planItems: PlanItem[] = [];
  isLoadingMasterData: boolean = false; // โหลด Machine/Fac (เร็ว)
  isLoadingParts: boolean = false;      // โหลด Process/PartNo (ช้า)
  minDate: Date = new Date(); // Disable past dates
  selectAll: boolean = false; // "Select All" checkbox state

  constructor(
    private pcPlanService: PCPlanService,
    private notificationService: NotificationService,
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  goToPlanList(): void {
    this.router.navigate(['/production/PlanList']);
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadDivisions();
    }
  }

  loadDivisions() {
    this.pcPlanService.clearCache(); // Force fresh data from server
    this.pcPlanService.getDivisions().subscribe({
      next: (data: any[]) => {
        // console.log('DEBUG: Raw divisions received:', data?.length, data);
        // Use Division_Id (INT) as the key - matches updated SP parameter
        this.divisionOptions = data
          .map(item => {
            const divId = (item.Division_Id ?? '').toString().trim(); // '2' or '71DZ' = PMC, '3' or '7122' = GM
            const pc = (item.Profit_Center || '').toString().trim();  // Division_Purchase value
            let displayLabel = pc || divId;
            if (divId === '2' || divId === '71DZ' || pc === '71DZ' || pc === 'PMC') {
              displayLabel = 'PMC';
            } else if (divId === '3' || divId === '7122' || pc === '7122' || pc === 'GM') {
              displayLabel = 'GM';
            }
            return {
              code: divId,          // Now an integer string: '2' or '3'
              label: displayLabel,
              profitCenter: pc      // Kept for reference / Excel matching
            };
          })
          .filter(item => item.code !== '')
          .filter((item, index, self) =>
            self.findIndex(t => t.code === item.code) === index
          );

        // Restore state AFTER divisions are loaded (Delayed to prevent UI blocking)
        setTimeout(() => {
          this.restoreState();
        }, 100);
      },
      error: (err) => {
        console.error('Error loading divisions:', err);
      }
    });
  }

  restoreState() {
    const state = this.pcPlanService.getPlanState();
    if (state && state.planItems.length > 0) {
      this.selectedDivisionCode = state.selectedDivisionCode;
      this.planItems = state.planItems.map((item: any) => ({
        ...item,
        date: item.date ? new Date(item.date) : null
      }));
      if (this.selectedDivisionCode) {
        this.loadMasterData(this.selectedDivisionCode);
      }
      this.checkAllSelected(); // Sync 'Select All' checkbox
    } else {
      this.addRow();
    }
  }

  saveCurrentState() {
    this.pcPlanService.setPlanState({
      selectedDivisionCode: this.selectedDivisionCode,
      planItems: this.planItems
    });
  }

  // Helper: Generate a Unique Plan ID (PLAN- + full UUID)
  private generatePlanUniqueId(): string {
    let uuid: string;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      uuid = crypto.randomUUID(); // Cryptographically random, 100% unique
    } else {
      // Fallback for non-HTTPS environments (Math.random)
      uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    return `PLAN-${uuid}`;            // e.g. PLAN-550e8400-e29b-41d4-a716-446655440000
  }

  // --- ส่วนที่ 1: Download Format (ดาวน์โหลดฟอร์ม Excel แบบสวยงาม พร้อมคำอธิบาย) ---
  downloadFormat() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Format Planning');

    // 1. กำหนด Columns และ Width
    // Unique_Id is the FIRST column — generated here, persisted all the way to DB
    worksheet.columns = [
      { header: 'Unique_Id', key: 'UniqueId', width: 42 },
      { header: 'Date', key: 'Date', width: 15 },
      { header: 'Div', key: 'Div', width: 10 },
      { header: 'Part Before', key: 'PartBefore', width: 25 },
      { header: 'Part No.', key: 'PartNo', width: 25 },
      { header: 'Process', key: 'Process', width: 15 },
      { header: 'Machine Type', key: 'MachineType', width: 15 },
      { header: 'Bar Type', key: 'BarType', width: 15 },
      { header: 'Fac', key: 'Fac', width: 15 },
      { header: 'MC No', key: 'MCNo', width: 10 },
      { header: 'QTY', key: 'QTY', width: 15 },
      { header: 'Time', key: 'Time', width: 10 },
      { header: 'Comment', key: 'Comment', width: 20 },
    ];

    // 2. ใส่ข้อมูลตัวอย่าง (Row 2 & 3)
    // Row 2: Full Example — each row gets a pre-generated Unique_Id
    worksheet.addRow({
      UniqueId: this.generatePlanUniqueId(),
      Date: 'DD/MM/YYYY',
      Div: '71DZ',
      PartBefore: 'A5B68-2-M1A',
      PartNo: 'A5B34-4AM1A',
      Process: 'TURNING',
      MachineType: 'BM165',
      BarType: 'BM-12',
      Fac: 'F.4',
      MCNo: '1',
      QTY: 1,
      Time: '4',
      Comment: 'EX.2'
    });

    // Row 3: Div Example Only
    worksheet.addRow({
      UniqueId: this.generatePlanUniqueId(),
      Div: '7122'
    });

    // 3. จัดรูปแบบ Header (Row 1) - ใส่สีที่หัวคอลัมน์หลักแทน Row 4
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25; // ให้หัวสูงขึ้นนิดนึง
    headerRow.eachCell((cell, colNumber) => {
      let bgColor = 'FF1B5E20'; // เขียวเข้ม (Default)
      let fontColor = 'FFFFFFFF'; // สีขาว

      if (colNumber === 1) { // Unique_Id
        bgColor = 'FFD32F2F'; // สีแดง (ห้ามแก้ไข)
      } else if ([4, 8, 11, 12, 13].includes(colNumber)) {
        // คอลัมน์ที่เคยเขียนว่า "กรอกไม่กรอกก็ได้" หรือ "ต้องเป็น F.xxx"
        // 4=Part Before, 8=Bar Type, 11=QTY, 12=Time, 13=Comment
        bgColor = 'FFFFD54F'; // สีส้มเหลือง (แจ้งเตือน/Optional)
        fontColor = 'FF000000'; // สีดำเพื่อให้เห็นชัดบนส้มเหลือง
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor }
      };
      cell.font = {
        color: { argb: fontColor },
        bold: true,
        size: 11
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    // 4. จัดรูปแบบ Row 2-3 (ข้อมูลตัวอย่าง)
    [2, 3].forEach(rIdx => {
      const r = worksheet.getRow(rIdx);
      r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber === 1) {
          // Style the Unique_Id cell (col 1) with a subtle blue tint
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE3F2FD' } // Light Blue 50
          };
          cell.font = { color: { argb: 'FF1565C0' }, size: 9 }; // Blue 800
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'hair' }, left: { style: 'thin' },
            bottom: { style: 'hair' }, right: { style: 'hair' }
          };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
          };
        }
      });
    });

    // --- 150 blank data rows, each pre-seeded with a unique Unique_Id ---
    // ทุกครั้งที่ดาวน์โหลด จะสุ่ม UUID ใหม่ 150 ค่า ไม่ซ้ำกันแน่นอน
    const BLANK_ROWS = 150;
    for (let i = 0; i < BLANK_ROWS; i++) {
      const dataRow = worksheet.addRow({ UniqueId: this.generatePlanUniqueId() });

      // Style the Unique_Id cell (col 1) with a subtle blue tint — signals "auto-generated, do not edit"
      const idCell = dataRow.getCell(1);
      idCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE3F2FD' } // Light Blue 50
      };
      idCell.font = { color: { argb: 'FF1565C0' }, size: 9 }; // Blue 800
      idCell.alignment = { vertical: 'middle', horizontal: 'left' };
      idCell.border = {
        top: { style: 'hair' }, left: { style: 'thin' },
        bottom: { style: 'hair' }, right: { style: 'hair' }
      };
    }

    // 6. เปิด AutoFilter (13 columns: A=Unique_Id through M=Comment)
    worksheet.autoFilter = { from: 'A1', to: 'M1' };

    // 7. Export ไฟล์
    workbook.xlsx.writeBuffer().then((buffer: ArrayBuffer) => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PCPlan_Template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }
  // --- ส่วนที่ 2: Upload Excel (Import ข้อมูลจาก Excel) ---

  // ฟังก์ชันนี้จะถูกเรียกเมื่อ User เลือกไฟล์ (Change Loop)
  onFileChange(evt: any) {
    const target: DataTransfer = <DataTransfer>(evt.target);

    // เช็คว่าเป็นไฟล์เดียวหรือไม่
    if (target.files.length !== 1) {
      Swal.fire('Error', 'Cannot use multiple files', 'error');
      return;
    }

    const reader: FileReader = new FileReader();

    reader.onload = (e: any) => {
      // 1. อ่านข้อมูล Binary จากไฟล์
      const bstr: string = e.target.result;
      const wb: XLSX.WorkBook = XLSX.read(bstr, { type: 'binary' });

      // 2. ดึง Sheet แรกมาทำงาน
      const wsname: string = wb.SheetNames[0];
      const ws: XLSX.WorkSheet = wb.Sheets[wsname];

      // 3. แปลง Excel เป็น JSON Array
      const data = XLSX.utils.sheet_to_json(ws);

      // console.log('Excel Data:', data); // ดูข้อมูลดิบก่อน map

      // 4. Map ข้อมูลเข้าตาราง planItems
      this.mapExcelToTable(data);
    };

    reader.readAsBinaryString(target.files[0]);

    // Reset input เพื่อให้เลือกไฟล์เดิมซ้ำได้ถ้าต้องการ
    evt.target.value = '';
  }

  mapExcelToTable(data: any[]) {
    if (data.length === 0) return;

    // 1. ดึงค่า Division จากแถวแรกสุดของ Excel
    const firstRow = data[0];
    const excelDiv = firstRow['Div']; // อ่านค่าจากคอลัมน์ Div (Profit_Center เช่น "7122")

    if (excelDiv) {
      // 2. Match Excel 'Div' against Division options
      // Try profitCenter match first (Division_Purchase e.g. 'PMC' / 'GM')
      // then try label match, to support old-format Excel files (e.g. '71DZ', '7122')
      let matchedDiv = this.divisionOptions.find(d => d.profitCenter === excelDiv?.toString());
      if (!matchedDiv) {
        matchedDiv = this.divisionOptions.find(d =>
          d.label.toLowerCase() === excelDiv?.toString().toLowerCase()
        );
      }

      if (matchedDiv) {
        // เจอ! ใช้ Division_Id ('2' or '3') เป็น selectedDivisionCode
        this.selectedDivisionCode = matchedDiv.code;
      } else {
        // ไม่เจอ ลองใช้ค่าตรงๆ (Fallback)
        this.selectedDivisionCode = excelDiv.toString();
      }

      // 3. โหลด Master Data ด้วย Division_Id ที่ถูกต้อง
      this.loadMasterData(this.selectedDivisionCode);
    } else {
      Swal.fire('Error', 'ไม่พบข้อมูล Division (Div) ในไฟล์ Excel กรุณาตรวจสอบ', 'error');
      return;
    }

    // 4. เตรียมตาราง (ไม่ลบของเก่าทิ้งถ้ามีข้อมูลอยู่ แต่กรองแถวว่างออกก่อน)
    // ลบเฉพาะแถวว่างๆ ที่ไม่มีข้อมูลอะไรเลยออก (Clean empty rows)
    this.planItems = this.planItems.filter(item => !this.isRowEmpty(item));

    // ถ้าไม่มีข้อมูลเหลือเลย (หรือข้อมูลเดิมเป็นแถวว่างทั้งหมด) -> ก็ถือว่าเริ่มใหม่
    // ถ้ามีข้อมูลค้างอยู่ -> ก็จะต่อท้ายข้อมูลใหม่เข้าไปเลย

    data.forEach(row => {
      // Find Fac even if header is Facility or FAC
      const rawFac = row['Fac'] || row['Facility'] || row['FAC'];

      // Normalize Facility: Convert 'Fac4' or 'Fac 4' to 'F.4' for consistency with Master Data
      let normalizedFac = rawFac ? rawFac.toString().trim() : null;
      if (normalizedFac) {
        const facMatch = normalizedFac.match(/Fac\s*(\d+)/i);
        if (facMatch) {
          normalizedFac = `F.${facMatch[1]}`;
        }
      }

      let pBef = row['Part Before'] ? row['Part Before'].toString().trim() : null;
      let pNo = row['Part No.'] ? row['Part No.'].toString().trim() : null;

      // ตรวจสอบว่าแถวนี้ว่างหรือไม่
      const dateVal = row['Date'];
      const mcNoVal = row['MC No'] || row['MC No.'];
      const processVal = row['Process'];
      const mcTypeVal = row['Machine Type'];
      const commentVal = (row['Comment'] || '').toString().trim();
      const rawUniqueId = (row['Unique_Id'] || row['UniqueId'] || '').toString().trim();

      if (!dateVal && !pNo && !processVal && !normalizedFac && !mcNoVal && !mcTypeVal && !commentVal) {
        // แถวนี้ไม่มีข้อมูลหลักใดๆ เลย (อาจมีแค่ Unique_Id ที่ template สุ่มมาให้) -> ข้ามไปเลยตามคำขอของ User
        return;
      }

      pBef = this.findMatchIgnoringSymbols(pBef, this.partBef);
      pNo = this.findMatchIgnoringSymbols(pNo, this.partNos);

      // Read Unique_Id from Excel (column A). Keep only valid PLAN-{uuid} values.
      const uniqueId = rawUniqueId.toUpperCase().startsWith('PLAN-') ? rawUniqueId : undefined;

      this.planItems.push({
        uniqueId: uniqueId,
        date: this.excelDateToJSDate(row['Date']),
        machineType: row['Machine Type'] ? row['Machine Type'].toString().trim() : null,
        fac: normalizedFac,
        mcNo: row['MC No'] ? row['MC No'].toString().trim() : (row['MC No.'] ? row['MC No.'].toString().trim() : ''),
        process: row['Process'] ? row['Process'].toString().trim() : null,
        partBef: pBef,
        partNo: pNo,
        barType: row['Bar Type'] ? row['Bar Type'].toString().trim() : null,
        qty: row['QTY'] || null,
        time: row['Time'] ? row['Time'].toString().trim() : '',
        mcQty: (row['MC QTY'] ?? row['MC_QTY'] ?? row['mcQty'] ?? row['MC. QTY'] ?? row['MC.QTY'] ?? row['MC Qty'] ?? row['M/C QTY'] ?? row['MC Quantity']) || (row['MC No'] || row['MC No.'] ? String(row['MC No'] || row['MC No.']).split(/[,/]+/).map((s: string) => s.trim()).filter((s: string) => s && s !== '-').length : null),
        comment: row['Comment'] ? row['Comment'].toString().trim() : ''
      });
    });

    // Optional: แจ้งเตือนหลัง Import ว่าข้อมูลมาแล้ว แต่ยังไม่ Save
    Swal.fire({
      title: 'Import Successful',
      text: `Loaded ${this.planItems.length} rows. Please check data and click Send.`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    });

    // Save State for Persistence
    this.saveCurrentState();
  }

  // ฟังก์ชันช่วยแปลงวันที่จาก Excel (ที่เป็นตัวเลขหรือ String) เป็น string YYYY-MM-DD
  excelDateToJSDate(serial: any) {
    if (!serial) return '';

    let jsDate: Date | null = null;

    // A. ถ้า Excel ส่งมาเป็น String (เช่น '20/02/2569' หรือ '1/2/2026')
    if (typeof serial === 'string') {
      const s = serial.trim();

      // Case 1: Already yyyy-MM-dd (e.g., 2026-02-20) -> Valid
      if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s;

      // Case 2: Flexible DD/MM/YYYY or D/M/YYYY (AD or BE)
      // Regex accepts: 1-2 digits for day/month, 4 digits for year, separated by / or -
      const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10); // 1-12
        let year = parseInt(match[3], 10);

        // BE Check: If Year > 2400, assumes Buddhist Era -> Convert to AD
        if (year > 2400) year -= 543;

        jsDate = new Date(year, month - 1, day);
      }
    }
    // B. ถ้าเป็น Serial Number ของ Excel (เช่น 45678)
    else if (typeof serial === 'number') {
      const utc_days = Math.floor(serial - 25569);
      const utc_value = utc_days * 86400;
      jsDate = new Date(utc_value * 1000);
    }

    // C. Format output to 'YYYY-MM-DD' for HTML Date Input / Angular Material
    if (jsDate && !isNaN(jsDate.getTime())) {
      const y = jsDate.getFullYear();
      const m = String(jsDate.getMonth() + 1).padStart(2, '0');
      const d = String(jsDate.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return ''; // Invalid date
  }



  // Removed mapDivisionName - no longer needed, SP returns Division_Name directly

  // เมื่อมีการเปลี่ยน Division -> ให้โหลด Master Data ใหม่
  onDivisionChange() {
    // console.log('Selected Division Code:', this.selectedDivisionCode); // DEBUG LOG
    if (this.selectedDivisionCode) {
      this.loadMasterData(this.selectedDivisionCode);
    } else {
      this.clearMasterData(); // ถ้าไม่เลือกอะไร ให้เคลียร์ค่าทิ้ง
    }
    this.saveCurrentState();
  }

  // Updated: Load Master Data with Split Loading Strategy
  // 1. FAST: Load Machine/Fac immediately
  // 2. SLOW: Load Process/PartNo in background
  loadMasterData(divCode: string) {
    // Reset Arrays & Set Loading States
    this.machineTypes = [];
    this.facs = [];
    this.processes = [];
    this.partNos = [];
    this.partBef = [];

    this.isLoadingMasterData = true; // Show Main Spinner
    this.isLoadingParts = true;      // Show Parts Spinner (Background)

    // Call FAST API (Machine & Facility)
    this.pcPlanService.getMasterData(divCode, 'FAST').subscribe({
      next: (res) => {
        // --- Populate Machines ---
        this.machineTypes = res.machines.map((x: any) => x.MC);

        // --- Populate Facilities ---
        const uniqueFacs = new Set<string>();
        res.facilities.forEach((x: any) => {
          const fullName = x.FacilityName || '';
          const match = fullName.match(/F\.\d+/);
          const shortName = match ? match[0] : fullName;
          if (shortName) uniqueFacs.add(shortName);
        });
        this.facs = Array.from(uniqueFacs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        this.isLoadingMasterData = false; // Hide Main Spinner (User can select Machine/Fac now)

        // Call SLOW API (Process & PartNo) -> Background Loading
        this.pcPlanService.getMasterData(divCode, 'SLOW').subscribe({
          next: (resSlow) => {
            this.processes = resSlow.processes.map((x: any) => x.Process);
            this.partNos = resSlow.partNos.map((x: any) => x.PartNo);
            this.partBef = resSlow.partNos.map((x: any) => x.PartNo);

            // Re-normalize existing plan items if any were added from Excel
            this.planItems.forEach(item => {
              item.partBef = this.findMatchIgnoringSymbols(item.partBef, this.partBef);
              item.partNo = this.findMatchIgnoringSymbols(item.partNo, this.partNos);
            });

            this.isLoadingParts = false; // Hide Parts Spinner
          },
          error: (err) => {
            console.error('Error loading SLOW data:', err);
            this.isLoadingParts = false;
          }
        });
      },
      error: (err) => {
        console.error('Error loading FAST data:', err);
        this.isLoadingMasterData = false;
        this.isLoadingParts = false;
      }
    });
  }



  clearMasterData() {
    this.machineTypes = [];
    this.facs = [];
    this.processes = [];
    this.partNos = [];
    this.partBef = [];
  }

  // --- ส่วนจัดการตาราง (เหมือนเดิม) ---
  addRow() {
    this.planItems.push({
      date: null,
      machineType: null,
      fac: null,
      process: null,
      partBef: null,
      partNo: null,
      barType: null,
      mcNo: '',
      qty: null,
      time: '',
      mcQty: null,
      comment: '',
      groupId: null,
      revision: 0,
      checked: false
    } as any);
    this.saveCurrentState();
  }

  clearAll() {
    Swal.fire({
      title: 'Are you sure?',
      text: "รายการที่เลือกทั้งหมดจะถูกล้างทิ้ง คุณแน่ใจหรือไม่?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, clear all!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.planItems = [];
        this.selectedDivisionCode = '';
        this.clearMasterData();
        this.pcPlanService.clearPlanState();
        this.addRow();
        this.saveCurrentState();
      }
    });
  }

  isRowEmpty(item: PlanItem): boolean {
    // เช็คว่าแถวนี้ว่างเปล่าหรือไม่ (ไม่มีข้อมูลสำคัญ)
    return !item.date && !item.machineType && !item.fac && !item.mcNo && !item.partNo;
  }

  removeRow(index: number) {
    Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.planItems.splice(index, 1);
        this.saveCurrentState();
        this.checkAllSelected(); // Re-check selection state
        Swal.fire(
          'Deleted!',
          'Your row has been deleted.',
          'success'
        )
      }
    })
  }

  // --- Selection Logic ---

  toggleAll() {
    this.planItems.forEach(item => item.checked = this.selectAll);
    this.saveCurrentState();
  }

  checkAllSelected() {
    this.selectAll = this.planItems.length > 0 && this.planItems.every(item => item.checked);
    this.saveCurrentState();
  }

  hasSelectedItems(): boolean {
    return this.planItems.some(item => item.checked);
  }

  removeSelected() {
    Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete selected!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.planItems = this.planItems.filter(item => !item.checked);
        this.selectAll = false;
        this.saveCurrentState();
        Swal.fire(
          'Deleted!',
          'Selected items have been deleted.',
          'success'
        )
      }
    })
  }

  selectAllText(event: any) {
    event.target.select();
  }

  // --- Helper to clean and match Excel items with Master List ---
  findMatchIgnoringSymbols(rawText: string | null, masterList: string[]): string | null {
    if (!rawText || !masterList || masterList.length === 0) return rawText;

    const cleanRaw = rawText.toString().toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (!cleanRaw) return rawText;

    const matched = masterList.find(part => {
      if (!part) return false;
      const cleanPart = part.toString().toLowerCase().replace(/[^a-z0-9]/gi, '');
      return cleanPart === cleanRaw;
    });

    return matched || rawText;
  }

  // --- Custom Search for ng-select ---
  // Ignore special characters like dashes, spaces, etc. when searching
  customSearchFn(term: string, item: any): boolean {
    if (!term) return true;
    const cleanTerm = term.toLowerCase().replace(/[^a-z0-9]/gi, '');
    // ng-select wraps primitive items. item.label usually contains the display value.
    const itemValue = item.label || item;
    const cleanItem = itemValue ? itemValue.toString().toLowerCase().replace(/[^a-z0-9]/gi, '') : '';
    return cleanItem.includes(cleanTerm);
  }

  // ฟังก์ชันบันทึกข้อมูลเมือกดปุ่ม Send
  onSubmit() {
    // 1. ตรวจสอบว่ามีข้อมูลในตารางไหม
    if (this.planItems.length === 0) {
      Swal.fire('Warning', 'No data to save', 'warning');
      return;
    }

    // 2. ตรวจสอบว่าเลือก Division หรือยัง
    if (!this.selectedDivisionCode) {
      Swal.fire('Warning', 'กรุณาเลือก Division ก่อนทำรายการ', 'warning');
      return;
    }

    // 3. VALIDATION: ตรวจสอบข้อมูลแต่ละแถว
    const errors: string[] = [];
    this.planItems.forEach((item, index) => {
      const rowNum = index + 1;
      const errorMsg = this.validateRow(item);
      if (errorMsg) {
        errors.push(`Row ${rowNum}: ${errorMsg}`);
      }
    });

    if (errors.length > 0) {
      // แสดง Error ทั้งหมด
      const errorHtml = `
        <div style="text-align: left; max-height: 300px; overflow-y: auto; color: red;">
          ${errors.map(e => `<div>• ${e}</div>`).join('')}
        </div>
      `;
      Swal.fire({
        title: '<span style="color:#ef4444; font-weight:800;">Validation Failed</span>',
        html: `<div style="text-align:left; background:#fff1f2; border-radius:12px; padding:1.25rem; border:1px solid #fecaca; color:#991b1b;">
          Found <b>${errors.length} errors</b>. Please fix before sending again.<br><hr style="border:0.5px solid #fecaca; margin:10px 0;">${errorHtml}</div>`,
        icon: 'error',
        customClass: {
          popup: 'swal-premium-popup',
          title: 'swal-premium-title',
          confirmButton: 'swal-premium-confirm'
        }
      });
      return; // หยุดการทำงาน ไม่ส่งไป Backend
    }

    // 4. ถ้าผ่าน Validation ทั้งหมดค่อยส่ง
    // 4. ถ้าผ่าน Validation ทั้งหมด ให้ยืนยันก่อนส่ง (Premium Bill Style - Detailed List)

    // Determine Division display name (using Division_Id: 2=PMC, 3=GM)
    let displayDivision = this.selectedDivisionCode;
    if (this.selectedDivisionCode === '3') {
      displayDivision = 'GM';
    } else if (this.selectedDivisionCode === '2') {
      displayDivision = 'PMC';
    }

    const totalParts = this.planItems.length;

    let summaryHtml = `
      <div style="text-align: left; font-family: 'Kanit', sans-serif; color: #334155;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.95rem;">
          <span><strong>Division:</strong> <span style="color: #1d4ed8; font-weight: 600;">${displayDivision}</span></span>
          <span style="font-size: 0.85rem; color: #64748b;">รายการที่ต้องการบันทึก</span>
        </div>

        <div style="background: #f8fafc; border-radius: 8px; padding: 10px; margin-bottom: 15px; border: 1px solid #e2e8f0; max-height: 350px; overflow-y: auto;">
          <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid #cbd5e1; color: #475569; position: sticky; top: 0; background: #f8fafc; z-index: 1;">
                <th style="padding: 6px 4px; white-space: nowrap;">Part No.</th>
                <th style="padding: 6px 4px; white-space: nowrap;">MC Type</th>
                <th style="padding: 6px 4px; white-space: nowrap;">MC No.</th>
                <th style="padding: 6px 4px; white-space: nowrap;">Process</th>
                <th style="padding: 6px 4px; text-align: center; white-space: nowrap;">Fac</th>
                <th style="padding: 6px 4px; text-align: right; white-space: nowrap;">QTY</th>
                <th style="padding: 6px 4px; text-align: right; white-space: nowrap;">Time</th>
              </tr>
            </thead>
            <tbody>
    `;

    // Add All Items
    this.planItems.forEach((item) => {
      const part = item.partNo || '-';
      const mcType = item.machineType || '-';
      const mcNo = item.mcNo || '-';
      const process = item.process || '-';
      const fac = item.fac || '-';
      const qty = item.qty || '0';
      const time = item.time || '-';

      summaryHtml += `
        <tr style="border-bottom: 1px dashed #e2e8f0;">
          <td style="padding: 8px 4px; font-weight: 500;">${part}</td>
          <td style="padding: 8px 4px; color: #64748b;">${mcType}</td>
          <td style="padding: 8px 4px; color: #64748b;">${mcNo}</td>
          <td style="padding: 8px 4px; color: #64748b;">${process}</td>
          <td style="padding: 8px 4px; text-align: center; color: #64748b;">${fac}</td>
          <td style="padding: 8px 4px; text-align: right; font-weight: 600; color: #0f172a;">${qty}</td>
          <td style="padding: 8px 4px; text-align: right; font-weight: 600; color: #1d4ed8;">${time}</td>
        </tr>
      `;
    });

    summaryHtml += `
            </tbody>
          </table>
        </div>

        <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 2px solid #e2e8f0; padding-top: 12px;">
          <div style="text-align: right;">
            <span style="font-size: 1rem; color: #475569; margin-right: 12px; font-weight: 600;">รวมจำนวนรายการทั้งหมด (Total)</span>
            <span style="font-size: 1.5rem; font-weight: 800; color: #10b981;">${totalParts}</span>
            <span style="font-size: 0.9rem; color: #64748b; margin-left: 4px;">รายการ</span>
          </div>
        </div>
      </div>
    `;

    Swal.fire({
      title: '<span style="font-family: Kanit; font-weight: 800; color: #1e293b; font-size: 1.6rem;">Confirm Submission</span>',
      html: summaryHtml,
      showCancelButton: true,
      confirmButtonText: 'Submit',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#94a3b8',
      width: 800,
      customClass: {
        popup: 'swal-premium-popup-minimal',
        confirmButton: 'swal-premium-btn-primary',
        cancelButton: 'swal-premium-btn-secondary'
      },
      backdrop: `rgba(15, 23, 42, 0.6)`
    }).then((result) => {
      if (result.isConfirmed) {
        // Double Confirmation
        Swal.fire({
          title: '<span style="font-family: Kanit; font-weight: 800; color: #1e293b; font-size: 1.4rem;">Are you sure?</span>',
          html: '<span style="font-family: Kanit; color: #334155;">คุณต้องการบันทึกแผนงานทั้งหมดนี้ใช่หรือไม่?</span>',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Yes, Submit!',
          cancelButtonText: 'Go back',
          confirmButtonColor: '#10b981',
          cancelButtonColor: '#94a3b8',
          width: 450,
          customClass: {
            popup: 'swal-premium-popup-minimal',
            confirmButton: 'swal-premium-btn-primary',
            cancelButton: 'swal-premium-btn-secondary'
          },
          backdrop: `rgba(15, 23, 42, 0.6)`
        }).then((res2) => {
          if (res2.isConfirmed) {
            // Show Loading (Clean)
            Swal.fire({
              title: '',
              html: '<div style="font-family: Kanit; margin-top: 10px;">Saving your plan...</div>',
              allowOutsideClick: false,
              didOpen: () => Swal.showLoading(),
              customClass: { popup: 'swal-premium-popup-minimal' }
            });

            this.validateAndSave();
          } else if (res2.dismiss === Swal.DismissReason.cancel) {
            this.onSubmit(); // Reopen the first modal
          }
        });
      }
    });
  }

  performSave() {
    // 5. เตรียมข้อมูล (ใส่ Division และ EmployeeID ให้ครบทุกแถว)
    let empId = 'Unknown';
    if (isPlatformBrowser(this.platformId)) {
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        try {
          const userObj = JSON.parse(userStr);
          empId = userObj.Username || userObj.Employee_ID || 'Unknown';
        } catch (e) {
          console.error('Error parsing user data:', e);
        }
      }
    }

    // หา Profit_Center จาก Division ที่เลือก
    const selectedDiv = this.divisionOptions.find(d => d.code === this.selectedDivisionCode);

    const payload = this.planItems.map(item => {
      // FIX DATE FORMAT: Convert Date to 'YYYY-MM-DD' (Local Time)
      // PrimeNG p-calendar returns a Date object.
      // JSON.stringify() converts it to UTC (often resulting in previous day).
      // We must manually format it to local YYYY-MM-DD string.
      let formattedDate = '';
      if (item.date) {
        const d = new Date(item.date);
        let year = d.getFullYear();
        // BE Year Fix: If year is in Buddhist Era format (e.g. 2569), convert to AD (2026)
        if (year > 2400) {
          year -= 543;
        }
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
      }

      return {
        date: formattedDate,
        division: this.selectedDivisionCode,
        fac: item.fac,
        mcType: item.machineType,
        mcNo: item.mcNo || '',
        process: item.process,
        partNo: item.partNo,
        partBef: item.partBef || '',
        barType: item.barType || '',
        qty: item.qty || 0,
        time: item.time || 0,
        mcQty: (item.mcQty !== null && item.mcQty !== undefined && !isNaN(Number(item.mcQty)) && Number(item.mcQty) > 0)
          ? Number(item.mcQty)
          : (item.mcNo ? item.mcNo.split(/[,/]+/).map((s: string) => s.trim()).filter((s: string) => s && s !== '-').length : 0),
        comment: item.comment || '',
        employeeId: empId,
        uniqueId: item.uniqueId || null,
        revision: item.revision || 0
      };
    });

    // 6. Show Premium Loading
    Swal.fire({
      title: '',
      html: `
        <div style="padding: 20px;">
          <svg width="80" height="80" viewBox="0 0 50 50" style="margin: 0 auto; display: block;">
            <circle cx="25" cy="25" r="20" fill="none" stroke="#e2e8f0" stroke-width="4" />
            <circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round">
              <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
              <animate attributeName="stroke-dasharray" values="1,150;90,150;1,150" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <path d="M25 15 L25 25 L32 25" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" fill="none">
               <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="4s" repeatCount="indefinite" />
            </path>
          </svg>
          <div style="font-family: 'Kanit', sans-serif; margin-top: 20px; color: #1e293b; font-weight: 600; font-size: 1.1rem;">
            Saving your plans...
          </div>
          <div style="font-family: 'Kanit', sans-serif; margin-top: 5px; color: #64748b; font-size: 0.85rem;">
            รอสักครู่นะครับ เรากำลังจัดการข้อมูลให้คุณ.
          </div>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      customClass: {
        popup: 'swal-premium-popup-minimal'
      }
    });

    // 7. ส่งไป Backend
    forkJoin([
      timer(200), // Fast response delay
      this.pcPlanService.savePlan(payload)
    ]).subscribe({
      next: ([_, res]) => {
        if (res.fail > 0) {
          // Error case (keep existing logic or slightly refine?)
          // For now, keeping error logic but matching style if possible.
          // User asked for "Professional".
          // Let's keep the existing Error logic as it's complex and functional, but maybe refine the title.
          let errorHtml = '<div style="text-align: left; max-height: 200px; overflow-y: auto;">';
          res.errors.forEach((err: any) => {
            errorHtml += `<p><strong>Row ${err.index + 1}:</strong> ${err.error}</p>`;
          });
          errorHtml += '</div>';

          Swal.fire({
            html: `
              <svg width="200" height="120" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="margin: 0 auto; display: block;">
                  <path d="M 10 100 Q 100 98 190 100" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  <path d="M 35 95 C 30 90 40 85 35 80" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  <path d="M 28 85 C 23 80 33 75 28 70" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  <g transform="translate(45, 10)">
                    <path d="M 45 40 C 40 10 65 10 60 30" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 20 50 C 25 100 120 100 128 50" fill="#fbc3a1" stroke="#1d1d1f" stroke-width="2" stroke-linejoin="round"/>
                    <path d="M 46 50 L 56 80 L 90 80 L 100 50" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 56 80 L 73 100 L 90 80" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 24 65 L 50 65 L 56 80 M 90 80 L 96 65 L 123 65" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 18 50 L 130 50" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 18 50 C 50 40 90 40 130 50" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 65 45 C 60 15 85 15 80 35" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <circle cx="70" cy="28" r="1.5" fill="#1d1d1f"/><circle cx="75" cy="32" r="1.5" fill="#1d1d1f"/><circle cx="78" cy="25" r="1.5" fill="#1d1d1f"/>
                    <path d="M 105 45 C 100 15 125 15 120 35" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <circle cx="110" cy="28" r="1.5" fill="#1d1d1f"/><circle cx="115" cy="32" r="1.5" fill="#1d1d1f"/><circle cx="118" cy="25" r="1.5" fill="#1d1d1f"/>
                    <path d="M 20 45 C -20 55 -30 90 -5 90 C 15 90 10 60 10 60" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M -8 72 L -2 78 M -2 72 L -8 78" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                    <path d="M 2 82 C -2 88 12 85 14 80" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  </g>
              </svg>
              <h2 style="color: #c62828; font-family: Kanit, sans-serif; font-size: 2.2rem; font-weight: 800; margin: 15px 0 5px 0;">Ops!</h2>
              <p style="color: #8c5b5b; font-family: Kanit, sans-serif; font-size: 1.1rem; margin: 0 0 15px 0; font-weight: 500;">Something went wrong</p>

              <div style="background:rgba(255,255,255,0.6); border-radius:12px; padding:15px; border:1px solid #fecaca; color:#991b1b; text-align: left; font-family: Kanit, sans-serif; font-size: 0.9rem; max-height: 200px; overflow-y: auto;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                  <span>Success: <b>${res.count}</b></span>
                  <span>Failed: <b>${res.fail}</b></span>
                </div>
                <hr style="border:0.5px solid #fca5a5; margin:10px 0;">
                ${errorHtml}
              </div>
            `,
            showConfirmButton: true,
            confirmButtonText: 'Try again',
            showCloseButton: true,
            customClass: {
              popup: 'swal-turtle-popup-error',
              confirmButton: 'swal-turtle-btn-error',
              actions: 'swal-turtle-actions'
            },
            backdrop: `rgba(15, 23, 42, 0.5)`
          });
        } else {
          // SUCCESS (Premium Bill Style - No Icon)
          Swal.fire({
            html: `
              <svg width="200" height="120" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="margin: 0 auto; display: block; overflow: visible;">
                  <path d="M 0 100 Q 100 98 200 100" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  <g class="walking-turtle-group" transform="translate(10, 5)">
                    <path class="turtle-leg-back" d="M 125 95 C 120 75 145 75 140 95" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path class="turtle-leg-back" d="M 85 95 C 80 75 105 75 100 95" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 68 85 C 100 95 140 95 162 85" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 62 85 C 65 30 160 30 168 85" fill="#c4ebc8" stroke="#1d1d1f" stroke-width="2" stroke-linejoin="round"/>
                    <path d="M 88 85 L 98 55 L 132 55 L 142 85" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 98 55 L 115 35 L 132 55" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 66 70 L 92 70 L 98 55 M 132 55 L 138 70 L 165 70" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path class="turtle-leg-front" d="M 110 85 C 105 105 130 105 125 85" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <g class="turtle-leg-front">
                      <circle cx="115" cy="92" r="1.5" fill="#1d1d1f"/><circle cx="120" cy="95" r="1.5" fill="#1d1d1f"/><circle cx="122" cy="88" r="1.5" fill="#1d1d1f"/>
                    </g>
                    <path class="turtle-leg-front" d="M 70 85 C 65 105 90 105 85 85" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <g class="turtle-leg-front">
                      <circle cx="75" cy="92" r="1.5" fill="#1d1d1f"/><circle cx="80" cy="95" r="1.5" fill="#1d1d1f"/><circle cx="82" cy="88" r="1.5" fill="#1d1d1f"/>
                    </g>
                    <path d="M 64 78 C 30 80 40 40 60 40 C 75 40 70 60 70 60" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <circle cx="50" cy="50" r="2.5" fill="#1d1d1f"/>
                    <path d="M 58 55 C 60 62 48 65 46 60" fill="none" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round"/>
                  </g>
              </svg>
              <h2 style="color: #2e7d32; font-family: Kanit, sans-serif; font-size: 2.2rem; font-weight: 800; margin: 15px 0 5px 0;">Success!</h2>
              <p style="color: #5c6e58; font-family: Kanit, sans-serif; font-size: 1.1rem; margin: 0; font-weight: 500;">บันทึกข้อมูลแผนงานสำเร็จแล้ว</p>
              <p style="color: #8da488; font-family: Kanit, sans-serif; font-size: 0.95rem; margin-top: 5px;">(บันทึกทั้งหมด ${res.successCount} รายการ)</p>
            `,
            showConfirmButton: true,
            confirmButtonText: 'Continue',
            showCloseButton: true,
            timer: 5000,
            timerProgressBar: true,
            customClass: {
              popup: 'swal-turtle-popup-success',
              confirmButton: 'swal-turtle-btn-success',
              actions: 'swal-turtle-actions'
            },
            backdrop: `rgba(15, 23, 42, 0.5)`
          });

          // Send Email Notification to all roles
          const planDate = payload[0]?.date || '-';
          const emailComment = payload[0]?.comment || '-';
          this.pcPlanService.sendEmail(null, empId, planDate, emailComment, ['PC', 'pc', 'engineer', 'en', 'eng', 'purchase', 'ph', 'QC', 'qc', 'production', 'pd', 'Gague', 'gauge'], [], 'Waiting PD & EN & QC').subscribe({
            next: (emailRes) => console.log('Email sent successfully to all roles'),
            error: (emailErr) => console.error('Failed to send email notification:', emailErr)
          });

          // Clear form
          this.planItems = [];
          this.addRow(); // Reset to 1 empty row
        }
      },
      error: (err) => {
        console.error('Save error:', err);
        Swal.fire({
          html: `
              <svg width="200" height="120" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="margin: 0 auto; display: block;">
                  <path d="M 10 100 Q 100 98 190 100" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  <path d="M 35 95 C 30 90 40 85 35 80" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  <path d="M 28 85 C 23 80 33 75 28 70" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  <g transform="translate(45, 10)">
                    <path d="M 45 40 C 40 10 65 10 60 30" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 20 50 C 25 100 120 100 128 50" fill="#fbc3a1" stroke="#1d1d1f" stroke-width="2" stroke-linejoin="round"/>
                    <path d="M 46 50 L 56 80 L 90 80 L 100 50" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 56 80 L 73 100 L 90 80" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 24 65 L 50 65 L 56 80 M 90 80 L 96 65 L 123 65" fill="none" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 18 50 L 130 50" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 18 50 C 50 40 90 40 130 50" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M 65 45 C 60 15 85 15 80 35" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <circle cx="70" cy="28" r="1.5" fill="#1d1d1f"/><circle cx="75" cy="32" r="1.5" fill="#1d1d1f"/><circle cx="78" cy="25" r="1.5" fill="#1d1d1f"/>
                    <path d="M 105 45 C 100 15 125 15 120 35" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <circle cx="110" cy="28" r="1.5" fill="#1d1d1f"/><circle cx="115" cy="32" r="1.5" fill="#1d1d1f"/><circle cx="118" cy="25" r="1.5" fill="#1d1d1f"/>
                    <path d="M 20 45 C -20 55 -30 90 -5 90 C 15 90 10 60 10 60" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>
                    <path d="M -8 72 L -2 78 M -2 72 L -8 78" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                    <path d="M 2 82 C -2 88 12 85 14 80" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round"/>
                  </g>
              </svg>
              <h2 style="color: #c62828; font-family: Kanit, sans-serif; font-size: 2.2rem; font-weight: 800; margin: 15px 0 5px 0;">Ops!</h2>
              <p style="color: #8c5b5b; font-family: Kanit, sans-serif; font-size: 1.1rem; margin: 0 0 15px 0; font-weight: 500;">Failed to save plan</p>

              <div style="background:rgba(255,255,255,0.6); border-radius:12px; padding:15px; border:1px solid #fecaca; color:#991b1b; text-align: center; font-family: Kanit, sans-serif; font-size: 0.9rem;">
                ${err.message || 'Unknown server error'}
              </div>
            `,
          showConfirmButton: true,
          confirmButtonText: 'Try again',
          showCloseButton: true,
          customClass: {
            popup: 'swal-turtle-popup-error',
            confirmButton: 'swal-turtle-btn-error',
            actions: 'swal-turtle-actions'
          },
          backdrop: `rgba(15, 23, 42, 0.5)`
        });
      }
    });
  }

  // ── Excel Validation: Check Complete Status Before Save ──────────────
  // Called instead of performSave() after user double-confirms.
  // Handles 4 groups: A=cancelWithReturn, B=normalCancel, C=skip, D=normalSave
  validateAndSave() {
    const uniqueIdsToCheck = this.planItems
      .map(i => i.uniqueId)
      .filter(id => !!id) as string[];

    if (uniqueIdsToCheck.length === 0) {
      this.performSave();
      return;
    }

    Swal.fire({
      title: '', html: '<div style="padding:10px">Checking plan status...</div>',
      allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading()
    });

    const empId = (() => {
      try {
        const u = JSON.parse(sessionStorage.getItem('user') || '{}');
        return u.Employee_Name || u.Username || u.Employee_ID || 'PC';
      } catch { return 'PC'; }
    })();

    this.http.post<any[]>(
      `${environment.apiUrl}/api/pc-plan/check-complete-status`,
      { uniqueIds: uniqueIdsToCheck }
    ).subscribe({
      next: (statusList) => {
        Swal.close();

        const cancelItems = this.planItems.filter(i => (i.comment || '').trim().toLowerCase() === 'cancel');
        const normalItems = this.planItems.filter(i => (i.comment || '').trim().toLowerCase() !== 'cancel');

        const statusMap = new Map(statusList.map(s => [(s.uniqueId || '').toUpperCase(), s]));

        let cancelHitAllComplete = false;
        let cancelHitHasComplete = false;
        let cancelHitHasWaiting = false;

        cancelItems.forEach(item => {
          if (item.uniqueId && statusMap.has(item.uniqueId.toUpperCase())) {
            const s = statusMap.get(item.uniqueId.toUpperCase())!;
            if (s.allComplete) cancelHitAllComplete = true;
            if (s.hasComplete) cancelHitHasComplete = true;
            if (s.hasWaiting) cancelHitHasWaiting = true;
          }
        });

        const groupC = normalItems.filter(i => {
          if (!i.uniqueId || !statusMap.has(i.uniqueId.toUpperCase())) return false;
          const s = statusMap.get(i.uniqueId.toUpperCase())!;
          return s.hasComplete || s.allComplete;
        });

        const groupD = normalItems.filter(i => !groupC.includes(i));

        const executeSaves = () => {
          const cancelPayload = cancelItems.map(item => {
            const existing = item.uniqueId ? statusMap.get(item.uniqueId.toUpperCase()) : null;
            let targetRevision = 1;
            let targetGroupId = item.groupId;

            if (existing) {
              targetRevision = (existing.Revision || 0) + 1;
              targetGroupId = existing.GroupId;
            }

            let formattedDate = '';
            const dateToUse = item.date || (existing ? existing.PlanDate : null);
            if (dateToUse) {
              const d = new Date(dateToUse); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0');
              formattedDate = `${y}-${m}-${dd}`;
            }

            return { ...item, date: formattedDate, mcType: item.machineType, division: this.selectedDivisionCode, employeeId: empId, planStatus: 'Cancelled', revision: targetRevision, groupId: targetGroupId };
          });

          const normalPayload = groupD.map(item => {
            const existing = item.uniqueId ? statusMap.get(item.uniqueId.toUpperCase()) : null;
            let targetRevision = 0;
            let targetGroupId = item.groupId || null;

            if (existing) {
              targetGroupId = existing.GroupId;
              // Compare key fields to see if this is an "Edit"
              const fields = [
                { k: 'date', dk: 'PlanDate', t: (v: any) => v ? new Date(v).toISOString().slice(0, 10) : '' },
                { k: 'partNo', dk: 'PartNo', t: (v: any) => (v || '').toString().trim() },
                { k: 'partBef', dk: 'Before_Part', t: (v: any) => (v || '').toString().trim() },
                { k: 'process', dk: 'Process', t: (v: any) => (v || '').toString().trim() },
                { k: 'machineType', dk: 'MC_Type', t: (v: any) => (v || '').toString().trim() },
                { k: 'barType', dk: 'Bar_Type', t: (v: any) => (v || '').toString().trim() },
                { k: 'fac', dk: 'Facility', t: (v: any) => (v || '').toString().trim() },
                { k: 'mcNo', dk: 'MC_No', t: (v: any) => (v || '').toString().trim() },
                { k: 'qty', dk: 'QTY', t: (v: any) => parseFloat(v) || 0 },
                { k: 'time', dk: 'Time', t: (v: any) => parseInt(v) || 0 }
              ];
              const hasChanged = fields.some(f => f.t(existing[f.dk]) !== f.t((item as any)[f.k]));
              if (hasChanged) {
                targetRevision = (existing.Revision || 0) + 1;
              }
            }

            let formattedDate = '';
            if (item.date) { const d = new Date(item.date); let year = d.getFullYear(); if (year > 2400) year -= 543; const mo = String(d.getMonth() + 1).padStart(2, '0'); const da = String(d.getDate()).padStart(2, '0'); formattedDate = `${year}-${mo}-${da}`; }
            return { ...item, date: formattedDate, mcType: item.machineType, barType: item.barType || null, division: this.selectedDivisionCode, employeeId: empId, uniqueId: item.uniqueId || null, revision: targetRevision, groupId: targetGroupId };
          });

          const combinedPayload = [...cancelPayload, ...normalPayload];
          if (combinedPayload.length === 0) {
            if (groupC.length > 0) {
              Swal.fire({
                icon: 'warning',
                title: 'Skipped',
                html: `<b>${groupC.length} รายการ ถูกข้าม</b> เนื่องจากแผนงานเก่าเสร็จสมบูรณ์แล้ว ไม่สามารถเขียนทับได้`,
              });
            }
            return;
          }

          Swal.fire({ title: '', html: '<div style="padding:10px">Saving your plans...</div>', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

          this.pcPlanService.savePlan(combinedPayload).subscribe({
            next: () => {
              Swal.fire({
                icon: 'success',
                title: 'Upload Summary',
                html: `
                      <div style="text-align:left;font-size:0.9rem;line-height:1.8;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                          <span style="background:#dcfce7;color:#166534;border-radius:999px;padding:2px 10px;font-weight:700;">✅ Saved / Cancelled</span>
                          <span>${cancelPayload.length + normalPayload.length} รายการ</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                          <span style="background:#fef2f2;color:#991b1b;border-radius:999px;padding:2px 10px;font-weight:700;">❌ Skipped</span>
                          <span>${groupC.length} รายการ (Status = Complete ไม่สามารถเขียนทับได้)</span>
                        </div>
                        ${groupC.length > 0 ? `<div style="margin-top:10px;background:#fef2f2;border-radius:8px;padding:8px;font-size:0.8rem;color:#7f1d1d;max-height:100px;overflow-y:auto;">${groupC.map(i => `• ${i.partNo || '-'} (${i.mcNo || '-'})`).join('<br>')}</div>` : ''}
                      </div>`,
                confirmButtonColor: '#0f172a'
              });
              // Send Email Notification to AonQC and AonEN
              const planDate = combinedPayload[0]?.date || '-';
              const emailComment = combinedPayload[0]?.comment || '-';
              this.pcPlanService.sendEmail(null, empId, planDate, emailComment, ['QC', 'qc', 'engineer', 'en', 'eng'], []).subscribe({
                next: (emailRes) => console.log('Email sent successfully to QC and EN'),
                error: (emailErr) => console.error('Failed to send email notification:', emailErr)
              });

              this.planItems = [];
              this.addRow();
              this.saveCurrentState();
            },
            error: () => {
              Swal.fire('Error', 'Failed to save', 'error');
            }
          });
        };

        if (cancelItems.length > 0) {
          let title = 'Cancellation Warning';
          let text = '';
          let htmlDesc = '';

          const noticeBoxWrapper = `
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-top: 24px; text-align: left; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02);">
                <div style="font-size: 0.85rem; color: #64748b; line-height: 1.6;">
                  <strong><i class="bi bi-info-circle me-1"></i> หมายเหตุ:</strong>
            `;
          const noticeBoxEnd = `</div></div>`;

          if (cancelHitHasWaiting) {
            text = 'มีรายการอัปโหลดที่ <span style="color: #ea580c; font-weight: 700;">Production ได้ทำการ Request Tooling ไปเรียบร้อยแล้ว</span> อยู่<br>คุณต้องการยกเลิกแผนงานหรือไม่ครับ?';
            htmlDesc = `${noticeBoxWrapper}หากมีการ Cancel แผนที่มีการ Request Tooling รบกวนประสานงานต่อ ให้ Production ดำเนินงาน Return ของกลับคืนด้วยนะครับ ขอบคุณครับ${noticeBoxEnd}`;
          } else if (cancelHitHasComplete || cancelHitAllComplete) {
            text = 'มีรายการอัปโหลดที่ <span style="color: #16a34a; font-weight: 700;">Purchase ได้ดำเนินงานเสร็จเรียบร้อยแล้ว</span> อยู่<br>คุณต้องการยกเลิกแผนงานหรือไม่ครับ?';
            htmlDesc = `${noticeBoxWrapper}หากมีการ Cancel แผนที่ Purchase ดำเนินงานเสร็จเรียบร้อยแล้ว รบกวนประสานงานต่อ ให้ Production ดำเนินงาน Return ของกลับคืนด้วยนะครับ ขอบคุณครับ${noticeBoxEnd}`;
          } else {
            text = 'คุณต้องการยกเลิกแผนงานเหล่านี้หรือไม่?';
            htmlDesc = ''; // No return coordination instructions needed for normal cancel
          }

          const customStyles = `
              <style>
                .swal-cancel-modern-popup { border-radius: 16px !important; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important; padding-bottom: 24px !important; }
                .swal-cancel-modern-title { font-size: 1.5rem !important; font-weight: 700 !important; color: #1e293b !important; margin-bottom: 12px !important; }
                .swal-cancel-modern-html { font-size: 1.05rem !important; line-height: 1.5 !important; color: #334155 !important; }
                .swal-btn-rounded { border-radius: 8px !important; padding: 10px 24px !important; font-weight: 600 !important; letter-spacing: 0.025em !important; }
              </style>
            `;

          Swal.fire({
            title: title,
            html: `${customStyles}<div class="swal-cancel-modern-html"><div style="text-align: center;">${text}</div>${htmlDesc}</div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, cancel it',
            cancelButtonText: 'No, keep it',
            customClass: {
              popup: 'swal-cancel-modern-popup',
              title: 'swal-cancel-modern-title',
              confirmButton: 'swal-btn-rounded',
              cancelButton: 'swal-btn-rounded'
            }
          }).then((res) => {
            if (res.isConfirmed) {
              executeSaves();
            }
          });
        } else {
          executeSaves();
        }
      },
      error: () => {
        this.performSave();
      }
    });
  }

  // ฟังก์ชันตรวจสอบความถูกต้องของข้อมูลในแต่ละแถว

  validateRow(item: PlanItem): string | null {
    // If cancelling, bypass strict row validation (only need uniqueId and comment)
    if ((item.comment || '').trim().toLowerCase() === 'cancel') {
      return null;
    }

    const missing: string[] = [];

    if (!item.date) missing.push('Date');
    if (!item.mcNo) missing.push('MC No.');

    // เช็ค Dropdown ว่าต้องเลือก และต้องเป็นค่าที่มีอยู่จริงใน Master Data
    if (!item.machineType) {
      missing.push('Machine Type');
    } else if (this.machineTypes.length > 0 && !this.machineTypes.includes(item.machineType)) {
      return `Machine Type '${item.machineType}' is invalid.`;
    }

    if (!item.fac) {
      missing.push('Fac');
    } else if (this.facs.length > 0 && !this.facs.includes(item.fac)) {
      return `Facility '${item.fac}' is invalid.`;
    }

    if (!item.process) {
      missing.push('Process');
    } else if (this.processes.length > 0 && !this.processes.includes(item.process)) {
      return `Process '${item.process}' is invalid.`;
    }

    // PartNo สำคัญมาก
    if (!item.partNo) {
      missing.push('Part No.');
    } else if (this.partNos.length > 0 && !this.partNos.includes(item.partNo)) {
      return `Part No '${item.partNo}' is invalid.`;
    }

    if (missing.length > 0) {
      return `Missing required fields: ${missing.join(', ')}`;
    }

    return null; // ผ่าน
  }
}
