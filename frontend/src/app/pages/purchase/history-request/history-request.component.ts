import { Component, OnInit, Inject, PLATFORM_ID, HostListener, ChangeDetectorRef } from '@angular/core';
import { SidebarPurchaseComponent } from '../../../components/sidebar/sidebarPurchase.component';
import { NotificationComponent } from '../../../components/notification/notification.component';
import { RouterOutlet } from '@angular/router';
import { PurchaseHistoryservice } from '../../../core/services/PurchaseHistory.service';
import { DetailPurchaseRequestlistService } from '../../../core/services/DetailPurchaseRequestlist.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { AuthService } from '../../../core/services/auth.service';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx'
import * as ExcelJS from 'exceljs';
import * as fs from 'file-saver';
import { forkJoin } from 'rxjs';


@Component({
  selector: 'app-history-request',
  standalone: true,
  imports: [SidebarPurchaseComponent, RouterOutlet, NotificationComponent, CommonModule, FormsModule, NgSelectModule],
  templateUrl: './history-request.component.html',
  styleUrls: ['./history-request.component.scss']
})
export class HistoryRequestComponent implements OnInit {
  isLoading: boolean = false;
  isAutoFireEnabled: boolean = false;
  userRole: string = 'view';
  requests: any[] = [];
  filteredRequests: any[] = [];
  paginatedRequests: any[] = [];
  statussList: { label: string, value: string }[] = [];
  divisionList = [
    { label: 'GM', value: '7122' },
    { label: 'PMC', value: '71DZ' }
  ];

  PartNoList: any[] = [];
  ItemNoList: any[] = [];
  SpecList: any[] = [];
  ProcessList: any[] = [];
  ReqDateList: any[] = [];
  DueDateList: any[] = [];
  DateCompleteList: any[] = [];
  CaseList: any[] = [];
  DocumentNoList: any[] = []; // ✅ สำหรับ dropdown Document_No
  CommentStatusList: any[] = [];
  CommentStatus_: string[] = [];
  isReadyOnly: boolean = false;

  get readyToCutCount(): number {
    return this.requests.filter(r => {
      const isFail = r.AS400STATUS === 'FAIL' || r.AS400STATUS === 'Failed' || r.AS400STATUS === 'Error';
      const status = (r.Status ?? '').toLowerCase().trim();
      const isComplete = status === 'complete' || status === 'completetoexcel' || status === 'completeas400';
      const matchDiv = !this.Division_ || r.Division === this.Division_ || 
        ((this.Division_ === '71DZ' || this.Division_ === 'PMC') && (r.Division === '71DZ' || r.Division === 'PMC')) ||
        ((this.Division_ === '7122' || this.Division_ === 'GM') && (r.Division === '7122' || r.Division === 'GM'));
      const isReady = r.Comment_Status && (r.Comment_Status.includes('พร้อมตัด') || r.Comment_Status.includes('มีของ'));
      return isFail && isComplete && matchDiv && isReady;
    }).length;
  }

  toggleReadyFilter() {
    this.isReadyOnly = !this.isReadyOnly;
    this.onFilter(true);
  }

  rebuildCommentStatusList() {
    const defaultOptions = [
      { label: 'มีของพร้อมตัด', value: 'มีของพร้อมตัด' },
      { label: 'ของหมดสต็อก', value: 'ของหมดสต็อก' },
      { label: 'สต็อกไม่พอตัด', value: 'สต็อกไม่พอตัด' },
      { label: 'ตัดสำเร็จ (Success)', value: 'ตัดสำเร็จ (Success)' },
      { label: 'ไม่พบใน Master', value: 'ไม่พบใน Master' },
      { label: 'ไม่มีเลขชั้นวาง', value: 'ไม่มีเลขชั้นวาง' }
    ];

    const isExcluded = (s: string) => {
      const lower = s.toLowerCase();
      return (
        s.includes('รอส่งตัด') ||
        s.includes('รอตัดใน PH') ||
        lower.includes('wait ph') ||
        lower.includes('pending')
      );
    };

    const currentStatuses = new Set<string>();
    this.requests.forEach(r => {
      if (r.Comment_Status && r.Comment_Status !== '-') {
        const formatted = this.formatCommentStatus(r.Comment_Status, r.ON_HAND, r.QTY, r.AS400STATUS, r.Stock_Location);
        if (formatted && !isExcluded(formatted)) {
          currentStatuses.add(formatted);
        }
      }
    });

    const list = [...defaultOptions];
    currentStatuses.forEach(s => {
      if (s.includes('สำเร็จ') || s.includes('Success')) {
        return; // รวมเป็น 'ตัดสำเร็จ (Success)' ใน defaultOptions แล้ว
      }
      if (isExcluded(s)) {
        return;
      }
      if (!list.some(item => item.value === s || item.label === s)) {
        list.push({ label: s, value: s });
      }
    });

    this.CommentStatusList = list;
  }

  Division_: string | null = null;
  PartNo_: string | null = null;
  ItemNo_: string | null = null;
  Spec_: string | null = null;
  Process_: string | null = null;
  DateComplete_: string | null = null;
  ReqDate_: string | null = null;
  DueDate_: string | null = null;
  Case_: string | null = null;
  DocumentNo_: string | null = null; // ✅ สำหรับเก็บค่าที่เลือก


  selectAllCheck: boolean = false;

  fromDate: string = '';
  toDate: string = '';
  Status_: string | null = 'Complete'; // ตั้งค่าเริ่มต้นเป็น Complete
  sortOrder: 'asc' | 'desc' = 'asc';

  sortKey: string = 'DateComplete';   // คอลัมน์ที่ sort
  sortAsc: boolean = false; // true = ASC, false = DESC

  // Pagination
  currentPage: number = 1;
  pageSize: number = 30;
  totalPages: number = 1;
  pages: number[] = [];

  // Inline Edit
  editingId: string | null = null;
  originalEditState: any = null;
  editMFGOrderNo: string = '';
  editDocNo: string = '';
  editItemNo: string = '';
  editDateComplete: string = '';
  editQty: number | null = null;
  editRemark: string = '';
  as400Config: any = { employeeId: '', pcName: '' };
  as400FilterStatus: 'all' | 'fail' | 'complete' | 'pending' = 'all';
  itemMasterList: any[] = [];
  showMockOnly: boolean = false;
  testCutLogs: any[] = [];

  constructor(private purchasehistory: PurchaseHistoryservice,
    private detailService: DetailPurchaseRequestlistService,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef
  ) { }

  isViewer(): boolean {
    return this.authService.isViewer();
  }

  isAdmin(): boolean {
    return (this.userRole || '').toLowerCase() === 'admin' || this.authService.isAdmin();
  }

  applyHighlightForSelection() {
    setTimeout(() => {
      this.requests.forEach((item, index) => {
        if (item.Selection) {
          const row = document.querySelector(`tr[data-index="${index}"]`);
          if (row) {
            row.querySelectorAll('td').forEach(td => {
              // td.style.backgroundColor = '#b6f0b6'; // สีที่ใช้ highlight
            });
          }
        }
      });
    }, 0); // ใช้ setTimeout เพื่อให้ DOM render เสร็จก่อนทำงาน
  }

  ngOnInit() {
    let role = sessionStorage.getItem('role');
    const userData = sessionStorage.getItem('user');
    if (!role && userData) {
      try {
        const userObj = JSON.parse(userData);
        role = userObj.role || userObj.Role;
      } catch (e) { }
    }
    this.userRole = (role || 'view').toLowerCase();
    this.loadItemMaster();
    this.loadPurchaseHistory();
    this.applyHighlightForSelection();
    this.loadAS400Config();

    // Auto-refresh to get new completed requests in real-time
    setInterval(() => {
      this.loadPurchaseHistory();
      this.loadAS400Config();
    }, 10000);
  }

  // ดึง Item Master จาก service ตัวเดียวกับหน้า detail (get_ItemNo → View_tb_Master_Purchase_SUM_ALL)
  loadItemMaster() {
    this.detailService.get_ItemNo().subscribe({
      next: (response: any[]) => {
        this.itemMasterList = response || [];
        // ถ้าโหลด history เสร็จแล้ว ให้ enrich MAIN_LOCATION
        if (this.requests.length > 0) {
          this.enrichStockLocation();
        }
      },
      error: (err: any) => console.error('Error loading item master:', err)
    });
  }

  // Fallback เติม Stock_Location เฉพาะกรณีที่ backend (tb_ItemMaster_Raw, single source of truth) ไม่ได้ส่งค่ามา
  // ห้าม overwrite ค่าที่ backend ส่งมาแล้ว เพราะจะทำให้ค่าที่ sync ล่าสุดถูกทับด้วยข้อมูลเก่าจาก View_tb_Master_Purchase_SUM_ALL
  enrichStockLocation() {
    if (!this.itemMasterList || this.itemMasterList.length === 0) return;

    this.requests.forEach(req => {
      if (req.ItemNo) {
        const targetItemNo = String(req.ItemNo).trim().toLowerCase();
        const found = this.itemMasterList.find((m: any) => {
          const mItemNo = String(m.ItemNo || '').trim().toLowerCase();

          // Map req.Division ('71DZ'/'PMC' vs '7122'/'GM') to m.Division_Id (2 vs 3)
          const reqDiv = String(req.Division || '').trim().toUpperCase();
          const isReqPMC = reqDiv === '71DZ' || reqDiv === 'PMC';
          const isReqGM = reqDiv === '7122' || reqDiv === 'GM';

          const mDivId = Number(m.Division_Id);
          const isMasterPMC = mDivId === 2;
          const isMasterGM = mDivId === 3;

          const divisionMatches = (isReqPMC && isMasterPMC) || (isReqGM && isMasterGM);

          return mItemNo === targetItemNo && divisionMatches;
        });

        // 1. Sync live stock levels (เฉพาะกรณีที่ backend ไม่ได้ส่ง ON_HAND มาให้)
        if (req.ON_HAND === undefined || req.ON_HAND === null) {
          if (found) {
            const liveStock = Number(found.ON_HAND ?? found.STOCK_ON_HAND ?? found.OnHand ?? 0);
            req.ON_HAND = liveStock;
            req.STOCK_ON_HAND = liveStock;
          } else {
            req.ON_HAND = 0;
            req.STOCK_ON_HAND = 0;
          }
        }

        // 2. Sync Location
        if (req.Stock_Location && req.Stock_Location.trim() !== '') {
          req.isMissingLocation = false;
        } else if (found && (found.MAIN_LOCATION || found.MainLocation)) {
          req.Stock_Location = found.MAIN_LOCATION || found.MainLocation || '';
          req.isMissingLocation = false;
        } else {
          // หาข้อมูลจากแผนกอื่น (ข้อมูลอื่นที่อยู่นอกเหนือ PMC)
          const foundOtherDiv = this.itemMasterList.find((m: any) =>
            String(m.ItemNo || '').trim().toLowerCase() === targetItemNo &&
            (m.MAIN_LOCATION || m.MainLocation)
          );

          if (foundOtherDiv) {
            // ดึงข้อมูลแผนกอื่นมาโชว์ แต่ mark ว่าเป็น cross-division (เพื่อให้ขึ้นสีแดงและกรอกได้)
            req.Stock_Location = foundOtherDiv.MAIN_LOCATION || foundOtherDiv.MainLocation || req.Stock_Location;
          }
          // ถ้าไม่เจอเลย ก็ให้คงค่า req.Stock_Location เดิมเอาไว้ (ไม่ต้องเคลียร์ทิ้ง)

          // Flag เพื่อให้เป็นสีแดงและแก้ไขได้เฉพาะตัวนี้
          req.isMissingLocation = !req.Stock_Location || req.Stock_Location.trim() === '';
        }

        // ปรับปรุง Comment_Status อัตโนมัติหลังเติม Stock/Location เรียบร้อยแล้ว
        req.Comment_Status = this.formatCommentStatus(req.Comment_Status, req.ON_HAND, req.QTY, req.AS400STATUS, req.Stock_Location);
      }
    });

    this.rebuildCommentStatusList();

    // รีเฟรชตารางหลังได้ข้อมูลมาเพื่ออัปเดต List Array Reference ให้ Angular เปลี่ยนแปลงการแสดงผลใน DOM ทันที
    if (this.Division_) {
      this.onFilter(false);
    }
  }

  loadAS400Config() {
    this.purchasehistory.getAS400Config().subscribe({
      next: (config) => {
        this.as400Config = config;
        if (config.isAutoFireEnabled !== undefined) {
          this.isAutoFireEnabled = config.isAutoFireEnabled;
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem('as400AutoFireEnabled', String(this.isAutoFireEnabled));
          }
        }
      },
      error: (err) => console.error('Failed to load AS400 Config:', err)
    });
  }

  toggleAllCheckboxes() {
    // Only toggle for currently filtered items
    this.filteredRequests.forEach(item => item.Selection = this.selectAllCheck);
    this.applyHighlightForSelection();
  }

  onCheckboxChange(item: any, index: number) {
    // item.Selection = !item.Selection; // REMOVED: ngModel already toggles the value
    this.applyHighlightForSelection();
  }


  loadPurchaseHistory(callback?: () => void) {
    // console.log('--- loadPurchaseHistory เริ่มต้น ---');
    this.purchasehistory.Purchase_History().subscribe({
      next: (response: any[]) => {
        // console.log('Raw response from API:', response);

        // Preserve state of existing items (Selection and DocNo)
        const currentStates = new Map<string, any>();
        this.requests.forEach(r => currentStates.set(String(r.Public_Id), { Selection: r.Selection, DocNo: r.DocNo }));

        // แทนค่า null/undefined ด้วยค่า default
        const parsedRequests: any[] = [];
        response.forEach(item => {
          const isPMC = item.Division === '71DZ' || item.Division === 'PMC';
          const rawMCNo = (item.MCNo ?? item.MC_No ?? '').toString().trim();
          const machineList = this.parseMachineNumbers(rawMCNo);

          const mcCode = item.MC_Code ?? '';
          const firstMC = machineList.length > 0 ? machineList[0].toString().trim() : '';
          const singleMCNo6Digit = firstMC ? `${mcCode}${firstMC}` : (item.MCNo6Digit || '');

          const existing = currentStates.get(String(item.Public_Id || item.ID_Request));

          parsedRequests.push({
            ...item,
            Selection: existing ? existing.Selection : false,
            ID_Request: item.ID_Request,
            Public_Id: item.Public_Id || item.ID_Request,
            DocNo: existing ? existing.DocNo : (item.DocNo || ''),
            PartNo: item.PartNo ?? '',
            DisplayPartNo: this.formatPartNumbers(item.PartNo ?? ''),
            Status: item.Status ?? '',
            DateRequest: item.DateRequest ?? item.DueDate ?? '',
            ItemNo: item.ItemNo ?? '',
            MFG_Order_No: isPMC ? (item.PartNo ?? '') : (item.MFGOrderNo ?? ''),
            DisplayMFG_Order_No: this.formatPartNumbers(isPMC ? (item.PartNo ?? '') : (item.MFGOrderNo ?? '')),
            Document_No: item.Document_No ?? '',
            MatLot: item.MatLot ?? '',
            Stock_Location: item.Stock_Location ?? '',
            ON_HAND: Number(item.ON_HAND ?? 0),
            STOCK_ON_HAND: Number(item.ON_HAND ?? 0),
            QTY: item.QTY ?? 0,
            MCType: item.MCType ?? '',
            MC_Code: mcCode,
            MC_No: rawMCNo,
            MCNo: rawMCNo,
            MCNo6Digit: singleMCNo6Digit,
            DueDate: item.DueDate ?? '',
            DateTime_Record: item.DateTime_Record ?? '',
            AS400STATUS: item.AS400STATUS ?? 'Pending',
            Comment_Status: this.formatCommentStatus(item.Comment_Status, Number(item.ON_HAND ?? item.STOCK_ON_HAND ?? 0), Number(item.QTY ?? 1), item.AS400STATUS, item.Stock_Location)
          });
        });
        this.requests = parsedRequests;
        this.rebuildCommentStatusList();


        // กรองเฉพาะ Status = 'Complete' -> แต่ยังไม่โชว์ ต้องรอเลือก Division
        if (callback) {
          callback();
        } else {
          this.filteredRequests = []; // เริ่มต้นเป็นว่าง
          this.updatePaginatedList();
        }
        // console.log('Requests loaded:', this.requests.length);

        // const uniqueDivisions = [...new Set(this.requests.map(r => r.Division).filter(c => c))];
        // this.divisionList = uniqueDivisions.map(d => ({ label: d, value: d }));
        this.divisionList = [
          { label: 'GM', value: '7122' },
          { label: 'PMC', value: '71DZ' }
        ];



        // กรองเฉพาะ Status = Complete / CompleteToExcel
        const completeRequests = this.requests.filter(r => {
          const status = (r.Status ?? '').toLowerCase().trim();
          return status === 'complete' || status === 'completetoexcel';
        });

        // ItemNo
        const uniqueItemNos = [...new Set(completeRequests.map(r => r.ItemNo).filter(c => c))];
        this.ItemNoList = uniqueItemNos.map(d => ({ label: d, value: d }));

        // PartNo / MFG Order No
        const uniquePartNos = [...new Set(completeRequests.map(r => r.PartNo).filter(c => c))];
        this.PartNoList = uniquePartNos.map(d => ({ label: d, value: d }));

        // ✅ Document_No
        const uniqueDocNos = [...new Set(completeRequests.map(r => r.DocNo).filter(c => c))];
        this.DocumentNoList = uniqueDocNos.map(d => ({ label: d, value: d }));

        // Spec
        const uniqueSpecs = [...new Set(completeRequests.map(r => r.SPEC).filter(c => c))];
        this.SpecList = uniqueSpecs.map(d => ({ label: d, value: d }));

        // // Process / Transaction
        // const uniqueProcesses = [...new Set(this.requests.map(r => r.Process).filter(c => c))];
        // this.ProcessList = uniqueProcesses.map(d => ({ label: d, value: d }));

        // console.log('Filtered requests after sortByDueDate:', this.filteredRequests);

        this.applyHighlightForSelection(); // เรียก highlight หลังโหลดข้อมูลเสร็จ
        this.enrichStockLocation(); // ดึง MAIN_LOCATION จาก item master ตัวเดียวกับหน้า detail
      },
      error: e => console.error('Error from API:', e)
    });
  }
  // getStatusClass(Status: string): string {
  //   const s = Status?.toLowerCase().trim();

  //   if (s === 'complete') return 'bg-white';          // สีขาว
  //   if (s === 'completetoexcel') return 'bg-complete'; // สีเขียว

  //   return '';
  // }

  // formatMC(item: any): string {
  //   const mcNo = item.MCNo ? item.MCNo.toString().padStart(3, '0') : '000';
  //   return `${item.MC_Code}${mcNo}`;
  // }

  formatMC(item: any): string {
    let mcNoStr = item.MCNo ? item.MCNo.toString().replace(/\s+/g, '') : '000';
    const mcNoParts = [mcNoStr.replace(/[^a-zA-Z0-9]/g, '')];
    const firstPart = mcNoParts[0];
    const firstThreeDigits = firstPart.slice(0, 3).padEnd(3, '0');

    const mcCode = item.MC_Code ? item.MC_Code.toString() : '';

    return `${mcCode}${firstThreeDigits}`;
  }
  // formatMC(item: any): string {
  //   let mcNoStr = item.MCNo ? item.MCNo.toString().replace(/\s+/g, '') : '000';

  //   // แยกด้วย comma
  //   const mcNoParts = [mcNoStr.replace(/[^a-zA-Z0-9]/g, '')];

  //   // เอา 3 ตัวแรกของตัวเลขตัวแรก
  //   const firstPart = mcNoParts[0];
  //   const firstThreeDigits = firstPart.slice(0, 3).padEnd(3, '0');

  //   return `${item.MC_Code}${firstThreeDigits}`;
  // }

  parseMachineNumbers(mcNoStr: string): string[] {
    if (!mcNoStr) return [];
    const cleanStr = mcNoStr.toString().replace(/\s+/g, '');
    if (!cleanStr) return [];

    const parts = cleanStr.split(',');
    const results: string[] = [];

    for (const part of parts) {
      if (part.includes('-')) {
        const rangeParts = part.split('-');
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0], 10);
          const end = parseInt(rangeParts[1], 10);
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) {
              results.push(i.toString());
            }
            continue;
          }
        }
      }
      if (part) {
        results.push(part);
      }
    }

    return results;
  }

  // ฟังก์ชันช่วยจัดรูปแบบข้อความ Part No. (แสดงแค่ 2 รายการ ถ้ามากกว่านั้นให้ใส่ +จำนวน)
  formatPartNumbers(partStr: string): string {
    if (!partStr) return '-';
    // แตกสตริงด้วย comma (เผื่อข้อมูลมาเป็นสตริงยาวๆ)
    const parts = partStr.split(',').map(p => p.trim()).filter(p => p);

    if (parts.length === 0) return '-';
    if (parts.length <= 2) {
      return parts.join(', ');
    }

    // ถ้าเกิน 2 รายการ ให้เอาตัวแรกมาแสดงและบอกจำนวนที่เหลือ
    return `${parts[0]} (+${parts.length - 1})`;
  }

  formatCommentStatus(comment?: string | null, onHand?: number, reqQty?: number, as400Status?: string, stockLocation?: string): string {
    const status = (as400Status || '').toUpperCase().trim();
    const isDone = status === 'DONE' || status === 'SUCCESS';
    const isFail = status === 'FAIL' || status === 'FAILED' || status === 'ERROR';

    const c = (comment || '').trim();

    // 1. ถ้าตัดสำเร็จแล้ว -> รวมเป็นคำเดียวตามคำขอผู้ใช้: 'ตัดสำเร็จ (Success)'
    if (isDone || c.includes('สำเร็จ') || c.includes('Success')) {
      return 'ตัดสำเร็จ (Success)';
    }

    // 2. ถ้ามีข้อความ Comment จาก DB หรือ API ให้จัดรูปแบบให้กระชับ
    if (c && c !== '-') {
      if (c.includes('On-Hand ในระบบเป็น 0') || c.includes('ของหมดสต็อก')) {
        return 'ของหมดสต็อก (On-Hand = 0)';
      }
      if (c.includes('พร้อมส่งตัด') || c.includes('พร้อมตัด') || c.includes('มีของพร้อมตัด')) {
        const oh = (onHand !== undefined && onHand !== null) ? onHand : null;
        return (oh !== null && oh !== undefined) ? `มีของพร้อมตัด (On-Hand: ${oh} ชิ้น)` : 'มีของพร้อมตัด';
      }
      if (c.includes('ไม่พอตัด')) {
        const match = c.match(/ขอ\s+(\d+)\s+\/\s+มี\s+(\d+)/) || c.match(/ต้องการ\s+(\d+)\s+ชิ้น\s+\/\s+มี\s+(\d+)\s+ชิ้น/);
        if (match) return `สต็อกไม่พอตัด (ขอ ${match[1]} / มี ${match[2]})`;
        if (reqQty !== undefined && onHand !== undefined) return `สต็อกไม่พอตัด (ขอ ${reqQty} / มี ${onHand})`;
        return 'สต็อกไม่พอตัด';
      }
      if (c.includes('Item Master') || c.includes('ไม่พบใน Master')) {
        return 'ไม่พบใน Master (iPBASS)';
      }
      if (c.includes('Location') || c.includes('เลขชั้น') || c.includes('ไม่มีเลขชั้นวาง')) {
        return 'ไม่มีเลขชั้นวาง (Location ว่าง)';
      }
      return c;
    }

    // 3. 🛡️ SMART FALLBACK: ถ้าไม่มี Comment มาจาก DB (null/empty/-) ให้ตรวจเช็คจาก Stock และ Location ทันที
    const oh = Number(onHand ?? 0);
    const needed = Number(reqQty ?? 1);
    const loc = (stockLocation || '').trim();

    if (!loc) {
      return 'ไม่มีเลขชั้นวาง (Location ว่าง)';
    }
    if (oh <= 0) {
      return 'ของหมดสต็อก (On-Hand = 0)';
    }
    if (oh < needed) {
      return `สต็อกไม่พอตัด (ขอ ${needed} / มี ${oh})`;
    }
    return `มีของพร้อมตัด (On-Hand: ${oh} ชิ้น)`;
  }

  getRowClass(item: any): string {
    let classes = [];
    if (item.Selection) {
      classes.push('row-selected');
    }

    if (item.AS400STATUS === 'DONE' || item.AS400STATUS === 'Success') {
      classes.push('row-success');
    } else if (item.AS400STATUS === 'FAIL' || item.AS400STATUS === 'Error') {
      classes.push('row-fail');
    }

    return classes.join(' ');
  }
  //  เรียงลำดับจาก DueDate เก่าสุด -> ล่าสุด
  onSort(key: string) {
    if (this.sortKey === key) {
      // ถ้ากดซ้ำ → สลับ ASC/DESC
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = true;
    }

    this.applySort();
  }

  applySort() {
    if (!this.sortKey) {
      this.currentPage = 1;
      this.updatePaginatedList();
      return;
    }

    this.filteredRequests.sort((a, b) => {
      const valA = a[this.sortKey] ?? '';
      const valB = b[this.sortKey] ?? '';

      // ✅ เช็คถ้าเป็น Date ให้แปลงเป็น number ก่อนเปรียบเทียบ
      const isDate = this.sortKey === 'ReqDate' || this.sortKey === 'DueDate' || this.sortKey === 'DateComplete';
      if (isDate) {
        const dateA = valA ? new Date(valA).getTime() : 0;
        const dateB = valB ? new Date(valB).getTime() : 0;
        return this.sortAsc ? dateA - dateB : dateB - dateA;
      }

      // ✅ ถ้าเป็น Number
      if (typeof valA === 'number' && typeof valB === 'number') {
        return this.sortAsc ? valA - valB : valB - valA;
      }

      // ✅ ถ้าเป็น String
      return this.sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

    this.currentPage = 1;
    this.updatePaginatedList();
  }


  //   onFilter() {
  //   this.filteredRequests = this.requests.filter(item => {
  //     const dueDate = item.DueDate ? new Date(item.DueDate) : null;
  //     const requestDate = item.DateRequest ? new Date(item.DateRequest) : null;
  //     const from = this.fromDate ? new Date(this.fromDate) : null;
  //     const to = this.toDate ? new Date(this.toDate) : null;

  //     // ตรวจสอบช่วงวันที่ สำหรับ DueDate หรือ DateRequest
  //     const matchDate = (!from || (dueDate && dueDate >= from) || (requestDate && requestDate >= from))
  //                    && (!to   || (dueDate && dueDate <= to)   || (requestDate && requestDate <= to));

  //     // ตรวจสอบ Division
  //     const matchDivision = !this.Division_ || item.Division === this.Division_;

  //     return matchDate && matchDivision;
  //   });
  // }
  // onFilter() {
  //   this.filteredRequests = this.requests.filter(item => {
  //     const matchDivision = !this.Division_ || item.Division === this.Division_;
  //     const matchItemNo = !this.ItemNo_ || item.ItemNo === this.ItemNo_;
  //     const matchPartNo = !this.PartNo_ || item.PartNo === this.PartNo_;
  //     const matchProcess = !this.Process_ || item.Process === this.Process_;

  //     const matchFromDate = !this.fromDate || new Date(item.Date) >= new Date(this.fromDate);
  //     const matchToDate = !this.toDate || new Date(item.Date) <= new Date(this.toDate);

  //     return matchDivision && matchItemNo && matchPartNo && matchProcess && matchFromDate && matchToDate;
  //   });
  // }

  onFilter(isManual: boolean = false) {
    if (isManual) {
      this.requests.forEach(r => r.Selection = false);
      this.selectAllCheck = false;
    }

    if (!this.Division_) {
      this.filteredRequests = [];
      if (isManual) {
        this.currentPage = 1;
      }
      this.updatePaginatedList();
      return;
    }

    this.filteredRequests = this.requests.filter(item => {
      //  กรอง Status
      const status = (item.Status ?? '').toLowerCase().trim();
      const matchStatus = status === 'complete' || status === 'completetoexcel' || status === 'completeas400';

      //  กรอง Division (Support both code and name)
      const reqDiv = String(item.Division || '').trim().toUpperCase();
      const isReqPMC = reqDiv === '71DZ' || reqDiv === 'PMC';
      const isReqGM = reqDiv === '7122' || reqDiv === 'GM';

      const isFilterPMC = this.Division_ === '71DZ' || this.Division_ === 'PMC';
      const isFilterGM = this.Division_ === '7122' || this.Division_ === 'GM';

      const matchDivision = (isFilterPMC && isReqPMC) || (isFilterGM && isReqGM) || item.Division === this.Division_;

      // กรอง Mock Data (ถ้า showMockOnly = true ให้โชว์แค่ isMockTest, ถ้า false ให้ซ่อน isMockTest)
      const matchMockState = this.showMockOnly ? (item.isMockTest === true) : (!item.isMockTest);

      // กรองอื่นๆ
      const matchItemNo = !this.ItemNo_?.length || this.ItemNo_.includes(item.ItemNo);
      const matchPartNo = !this.PartNo_?.length || this.PartNo_.includes(item.PartNo);
      const matchDocumentNo = !this.DocumentNo_?.length || this.DocumentNo_.includes(item.DocNo);


      // Date Complete Range Filter
      let matchDate = true;
      if (this.fromDate || this.toDate) {
        const targetDate = item.DateComplete || item.DateTime_Record || item.DueDate;
        if (targetDate) {
          const checkDate = new Date(targetDate);
          checkDate.setHours(0, 0, 0, 0);

          if (this.fromDate) {
            const start = new Date(this.fromDate);
            start.setHours(0, 0, 0, 0);
            if (checkDate < start) matchDate = false;
          }
          if (this.toDate) {
            const end = new Date(this.toDate);
            end.setHours(0, 0, 0, 0);
            if (checkDate > end) matchDate = false;
          }
        } else {
          matchDate = false;
        }
      }

      // กรองตาม AS400 Status (FAIL / COMPLETE / PENDING)
      let matchAS400 = true;
      if (this.as400FilterStatus === 'complete') {
        matchAS400 = item.AS400STATUS === 'DONE' || item.AS400STATUS === 'Success';
      } else if (this.as400FilterStatus === 'fail') {
        matchAS400 = item.AS400STATUS === 'FAIL' || item.AS400STATUS === 'Failed' || item.AS400STATUS === 'Error';
      } else if (this.as400FilterStatus === 'pending') {
        matchAS400 = !item.AS400STATUS || item.AS400STATUS === 'Pending' || item.AS400STATUS === 'Wait PH Issue';
      }

      // กรองตาม Comment Status
      let matchCommentStatus = true;
      if (this.CommentStatus_ && this.CommentStatus_.length > 0) {
        matchCommentStatus = this.CommentStatus_.some(selected => {
          if (!item.Comment_Status) return false;
          if (selected === 'ตัดสำเร็จ (Success)' || selected.includes('สำเร็จ')) {
            return item.Comment_Status.includes('สำเร็จ') || item.Comment_Status.includes('Success');
          }
          return item.Comment_Status === selected || item.Comment_Status.includes(selected);
        });
      }

      // กรองเฉพาะรายการ "มีของพร้อมตัด"
      let matchReady = true;
      if (this.isReadyOnly) {
        matchReady = !!(item.Comment_Status && (item.Comment_Status.includes('พร้อมตัด') || item.Comment_Status.includes('มีของ')));
      }

      return matchStatus && matchDivision && matchMockState && matchItemNo && matchPartNo && matchDocumentNo && matchDate && matchAS400 && matchCommentStatus && matchReady;
    });

    this.applySort();
  }

  onDivisionChange() {
    this.isLoading = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.onFilter(true);
      this.isLoading = false;
      this.cdr.markForCheck();
    }, 3000);
  }

  clearFilters() {
    // เคลียร์เฉพาะ filter ในตาราง (ไม่เคลียร์ Division)
    this.PartNo_ = '';
    this.ItemNo_ = '';
    this.Spec_ = '';
    this.Process_ = '';
    this.Case_ = '';
    this.DocumentNo_ = '';
    this.fromDate = '';
    this.toDate = '';
    this.as400FilterStatus = 'all';
    this.CommentStatus_ = [];
    this.isReadyOnly = false;
    this.requests.forEach(r => r.Selection = false);
    this.selectAllCheck = false;

    // รีเฟรชตารางหลังเคลียร์
    this.onFilter(true);
  }

  filterByAS400(status: 'fail' | 'complete' | 'pending') {
    if (status !== 'fail') {
      this.isReadyOnly = false;
    }
    if (this.as400FilterStatus === status) {
      this.as400FilterStatus = 'all'; // toggle off
    } else {
      this.as400FilterStatus = status;
    }
    this.onFilter(true);
  }

  // 📄 Pagination Logic
  updatePaginatedList() {
    this.totalPages = Math.ceil(this.filteredRequests.length / this.pageSize);
    if (this.totalPages < 1) this.totalPages = 1;

    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedRequests = this.filteredRequests.slice(startIndex, endIndex);

    this.generatePageNumbers();
  }

  generatePageNumbers() {
    const pagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(pagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + pagesToShow - 1);

    if (endPage - startPage + 1 < pagesToShow) {
      startPage = Math.max(1, endPage - pagesToShow + 1);
    }

    this.pages = [];
    for (let i = startPage; i <= endPage; i++) {
      this.pages.push(i);
    }
  }

  setPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.requests.forEach(r => r.Selection = false);
    this.selectAllCheck = false;
    this.currentPage = page;
    this.updatePaginatedList();

    if (isPlatformBrowser(this.platformId)) {
      const table = document.querySelector('.table-container');
      if (table) table.scrollTop = 0;
    }
  }

  // onFilter() {
  //   this.filteredRequests = this.requests.filter(item => {
  //     const itemDate = new Date(item.DateRequest || item.DueDate);

  //     const matchDate =
  //       (!this.fromDate || itemDate >= new Date(this.fromDate)) &&
  //       (!this.toDate || itemDate <= new Date(this.toDate));


  //     const matchDivision =
  //       !this.Division_ || item.Division === this.Division_;

  //     return matchDate && matchDivision;
  //   });
  // }



  // Inline Edit Methods
  startEdit(req: any) {
    if (this.isViewer()) return;
    this.editingId = req.Public_Id;
    this.editMFGOrderNo = req.MFG_Order_No || '';
    this.editDocNo = req.DocNo || '';
    this.editItemNo = req.ItemNo || '';

    let originalDateStr = '';
    if (req.DateComplete) {
      const d = new Date(req.DateComplete);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        this.editDateComplete = `${year}-${month}-${day}`;
        originalDateStr = this.editDateComplete;
      } else {
        this.editDateComplete = '';
      }
    } else {
      this.editDateComplete = '';
    }
    this.editQty = req.QTY;
    this.editRemark = req.Remark || '';

    this.originalEditState = {
      ItemNo: this.editItemNo,
      MFGOrderNo: this.editMFGOrderNo,
      DocNo: this.editDocNo,
      DateComplete: originalDateStr,
      QTY: this.editQty,
      Remark: this.editRemark
    };
  }

  cancelEdit() {
    this.editingId = null;
    this.originalEditState = null;
    this.editMFGOrderNo = '';
    this.editDocNo = '';
    this.editItemNo = '';
    this.editDateComplete = '';
    this.editQty = null;
    this.editRemark = '';
  }

  saveEdit(req: any) {
    const hasChanges = !this.originalEditState ||
      this.editItemNo !== this.originalEditState.ItemNo ||
      this.editMFGOrderNo !== this.originalEditState.MFGOrderNo ||
      this.editDocNo !== this.originalEditState.DocNo ||
      this.editDateComplete !== this.originalEditState.DateComplete ||
      this.editQty !== this.originalEditState.QTY ||
      this.editRemark !== this.originalEditState.Remark;

    if (!hasChanges) {
      this.editingId = null;
      this.originalEditState = null;
      return;
    }

    let parsedDate = null;
    if (this.editDateComplete) {
      parsedDate = new Date(this.editDateComplete).toISOString();
    }

    this.editingId = null;

    this.purchasehistory.updateHistoryFields({
      Public_Id: req.Public_Id,
      MFGOrderNo: this.editMFGOrderNo,
      DocNo: this.editDocNo,
      ItemNo: this.editItemNo,
      DateComplete: parsedDate,
      QTY: this.editQty,
      Remark: this.editRemark
    }).subscribe({
      next: () => {
        // Update local data
        req.MFG_Order_No = this.editMFGOrderNo;
        req.MFGOrderNo = this.editMFGOrderNo;
        req.DocNo = this.editDocNo;
        req.ItemNo = this.editItemNo;
        if (parsedDate) req.DateComplete = parsedDate;
        if (this.editQty !== null) req.QTY = this.editQty;
        req.Remark = this.editRemark;

        // Update Stock Location and On-Hand in real-time based on the new ItemNo
        this.updateRowWithNewItemNo(req, this.editItemNo);

        this.originalEditState = null;
        Swal.fire({ icon: 'success', title: 'Saved!', showConfirmButton: false, timer: 1000 });
      },
      error: (err: any) => {
        this.editingId = req.Public_Id;
        Swal.fire({ icon: 'error', title: 'Save failed', text: err?.error?.message || 'Update failed' });
      }
    });
  }

  updateRowWithNewItemNo(req: any, newItemNo: string) {
    if (!this.itemMasterList || this.itemMasterList.length === 0) return;

    const targetItemNo = String(newItemNo).trim().toLowerCase();

    // Map req.Division ('71DZ'/'PMC' vs '7122'/'GM') to m.Division_Id (2 vs 3)
    const reqDiv = String(req.Division || '').trim().toUpperCase();
    const isReqPMC = reqDiv === '71DZ' || reqDiv === 'PMC';
    const isReqGM = reqDiv === '7122' || reqDiv === 'GM';

    const found = this.itemMasterList.find((m: any) => {
      const mItemNo = String(m.ItemNo || '').trim().toLowerCase();
      const mDivId = Number(m.Division_Id);
      const isMasterPMC = mDivId === 2;
      const isMasterGM = mDivId === 3;
      const divisionMatches = (isReqPMC && isMasterPMC) || (isReqGM && isMasterGM);
      return mItemNo === targetItemNo && divisionMatches;
    });

    if (found) {
      req.Stock_Location = found.MAIN_LOCATION || found.MainLocation || '';
      req.ON_HAND = found.ON_HAND ?? found.OnHand ?? 0;
      req.STOCK_ON_HAND = found.ON_HAND ?? found.OnHand ?? 0;
      req.isMissingLocation = !req.Stock_Location || req.Stock_Location.trim() === '';
    } else {
      // Look in other divisions as fallback
      const foundOtherDiv = this.itemMasterList.find((m: any) =>
        String(m.ItemNo || '').trim().toLowerCase() === targetItemNo &&
        (m.MAIN_LOCATION || m.MainLocation)
      );

      if (foundOtherDiv) {
        req.Stock_Location = foundOtherDiv.MAIN_LOCATION || foundOtherDiv.MainLocation || '';
        req.ON_HAND = foundOtherDiv.ON_HAND ?? foundOtherDiv.OnHand ?? 0;
        req.STOCK_ON_HAND = foundOtherDiv.ON_HAND ?? foundOtherDiv.OnHand ?? 0;
        req.isMissingLocation = true; // Mark as red/cross-division
      } else {
        req.Stock_Location = '';
        req.ON_HAND = 0;
        req.STOCK_ON_HAND = 0;
        req.isMissingLocation = true;
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Check if click is inside an editable area or related controls
    const isInput = target.closest('input');
    const isSelect = target.closest('ng-select');
    const isDropdown = target.closest('.ng-dropdown-panel'); // ng-select dropdown
    const isButton = target.closest('button'); // OK button or others

    // If click is on any interaction element, do not clear
    if (isInput || isSelect || isDropdown || isButton) {
      return;
    }

    // Save active edits before clearing
    if (this.editingId) {
      const matchedReq = this.requests.find(r => r.Public_Id === this.editingId);
      if (matchedReq) {
        this.saveEdit(matchedReq);
      }
    }
  }

  removeFromLists(id: string) {
    this.requests = this.requests.filter(r => (r.Public_Id !== id && r.ID_Request !== id));
    this.filteredRequests = this.filteredRequests.filter(r => (r.Public_Id !== id && r.ID_Request !== id));
    this.paginatedRequests = this.paginatedRequests.filter(r => (r.Public_Id !== id && r.ID_Request !== id));
  }

  deleteRow(rowIndex: number) {
    const item = this.paginatedRequests[rowIndex];
    if (!item) return;

    const targetItemNo = String(item.ItemNo || '').trim().toLowerCase();
    const foundMaster = this.itemMasterList.find((m: any) => {
      const mItemNo = String(m.ItemNo || '').trim().toLowerCase();
      return mItemNo === targetItemNo;
    });
    const itemName = foundMaster ? (foundMaster.ItemName || foundMaster.EnglishName || foundMaster.Name || '-') : '-';

    const itemsHtml = `
      <div style="text-align: left; margin-bottom: 15px; font-family: 'Inter', sans-serif; font-size: 14px;">
        <span style="font-weight: 600; color: #ef4444;">Warning:</span> You are about to delete the following item. This action cannot be undone!
      </div>
      <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.06);">
        <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 13px; text-align: left; min-width: 900px;">
          <thead>
            <tr style="background-color: #edf2f7; color: #2d3748; font-weight: bold; border-bottom: 2px solid #cbd5e0;">
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 60px;">Div</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Req Item No</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Mfg Order No.</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 130px;">Doc No</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Part No.</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 180px;">Item Name</th>
              <th style="padding: 10px; text-align: center; width: 60px;">QTY</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background-color: #ffffff;">
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${item.Division || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #ef4444;">${item.ItemNo || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${item.MFG_Order_No || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${item.DocNo || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${item.PartNo || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${itemName}</td>
              <td style="padding: 8px 10px; font-weight: bold; text-align: center; color: #ef4444;">${item.QTY}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    Swal.fire({
      title: 'Confirm Delete? / ยืนยันการลบ?',
      html: itemsHtml,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, delete! / ใช่, ลบออก!',
      cancelButtonText: 'Cancel / ยกเลิก',
      width: '1000px'
    }).then((result) => {
      if (result.isConfirmed) {
        this.detailService.deleteRequest(item.ID_Request).subscribe({
          next: () => {
            const id = item.Public_Id || item.ID_Request;
            this.removeFromLists(id);
            if (isPlatformBrowser(this.platformId)) {

            }
            this.updatePaginatedList();
            Swal.fire({
              icon: 'success',
              title: 'Deleted / ลบเรียบร้อย',
              text: 'ลบข้อมูลสำเร็จ',
              showConfirmButton: false,
              timer: 1500
            });
          },
          error: (err: any) => {
            Swal.fire({
              icon: 'error',
              title: 'Error / เกิดข้อผิดพลาด',
              text: 'ไม่สามารถลบข้อมูลได้'
            });
          }
        });
      }
    });
  }

  isDeletingSelected = false;

  deleteSelected() {
    if (this.isDeletingSelected) return;

    const selectedItems = (this.filteredRequests || [])
      .filter(it => it?.Selection === true);

    if (selectedItems.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'Oops... / ขออภัย...',
        text: 'Please select at least one item to delete. / กรุณาเลือกอย่างน้อย 1 รายการเพื่อลบ'
      });
      return;
    }

    const itemsHtml = `
      <div style="text-align: left; margin-bottom: 15px; font-family: 'Inter', sans-serif; font-size: 14px;">
        <span style="font-weight: 600; color: #ef4444;">Warning:</span> You are about to delete the following <b>${selectedItems.length}</b> selected item(s). This action cannot be undone!
      </div>
      <div style="max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.06);">
        <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 13px; text-align: left; min-width: 1000px;">
          <thead>
            <tr style="background-color: #edf2f7; color: #2d3748; font-weight: bold; border-bottom: 2px solid #cbd5e0; position: sticky; top: 0; z-index: 10;">
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; text-align: center; width: 40px;">No</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 60px;">Div</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Item No</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Mfg Order No.</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 130px;">Doc No</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Part No.</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 180px;">Item Name</th>
              <th style="padding: 10px; text-align: center; width: 60px;">QTY</th>
            </tr>
          </thead>
          <tbody>
            ${selectedItems.map((it, idx) => {
      const targetItemNo = String(it.ItemNo || '').trim().toLowerCase();
      const foundMaster = this.itemMasterList.find((m: any) => {
        const mItemNo = String(m.ItemNo || '').trim().toLowerCase();
        return mItemNo === targetItemNo;
      });
      const itemName = foundMaster ? (foundMaster.ItemName || foundMaster.EnglishName || foundMaster.Name || '-') : '-';
      return `
                <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f7fafc'};">
                  <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
                  <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${it.Division || '-'}</td>
                  <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #ef4444; white-space: nowrap;">${it.ItemNo || '-'}</td>
                  <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.MFG_Order_No || '-'}</td>
                  <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.DocNo || '-'}</td>
                  <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.PartNo || '-'}</td>
                  <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemName}">${itemName}</td>
                  <td style="padding: 8px 10px; font-weight: bold; text-align: center; color: #ef4444;">${it.QTY}</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;

    Swal.fire({
      title: 'Confirm Delete? / ยืนยันการลบหลายรายการ?',
      html: itemsHtml,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, delete all! / ใช่, ลบทั้งหมด!',
      cancelButtonText: 'Cancel / ยกเลิก',
      width: '1100px'
    }).then((result) => {
      if (result.isConfirmed) {
        this.isDeletingSelected = true;

        // Run deletion calls in parallel using forkJoin
        const deleteObservables = selectedItems.map(it => this.detailService.deleteRequest(it.ID_Request));

        forkJoin(deleteObservables).subscribe({
          next: () => {
            selectedItems.forEach(item => {
              const id = item.Public_Id || item.ID_Request;
              this.removeFromLists(id);
            });

            this.isDeletingSelected = false;
            this.selectAllCheck = false;
            if (isPlatformBrowser(this.platformId)) {

            }
            this.updatePaginatedList();
            Swal.fire({
              icon: 'success',
              title: 'Deleted / ลบเรียบร้อย',
              text: 'ลบข้อมูลสำเร็จทั้งหมด',
              showConfirmButton: false,
              timer: 1500
            });
          },
          error: (err: any) => {
            this.isDeletingSelected = false;
            Swal.fire({
              icon: 'error',
              title: 'Error / เกิดข้อผิดพลาด',
              text: 'ไม่สามารถลบข้อมูลบางรายการได้ / Some items could not be deleted.'
            });
          }
        });
      }
    });
  }

  fileName = "ExcelSheet.xlsx";

  // exportexcel() {
  //   const table = document.getElementById("table-data") as HTMLTableElement;

  //   // แยก thead กับ tbody
  //   const thead = table.querySelector("thead");
  //   const tbody = table.querySelector("tbody");

  //   // เลือกเฉพาะ row ที่ checkbox ถูกติ๊กจาก tbody
  //   const selectedRows = Array.from(tbody?.querySelectorAll("tr") || [])
  //     .filter(row => {
  //     const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  //     return checkbox?.checked;
  //     });

  //   if (selectedRows.length === 0) {
  //     Swal.fire({ icon: 'error', title: 'Oops...', text: 'Please select at least one item to complete.' });
  //     return;
  //   }

  //   // สร้าง table ชั่วคราว
  //   const tempTable = document.createElement("table");

  //   // ใส่ thead เสมอ

  //    if (thead) {
  //     const clonedThead = thead.cloneNode(true) as HTMLElement;
  //     clonedThead.querySelectorAll("th").forEach((th, index) => {
  //       if (["0", "1","10", "13", "14", "15"].includes(index.toString())) {
  //         // 0 = checkbox, 12 = DueDate, 13 = RequestDate (ปรับ index ตามจริงใน table ของคุณ)
  //         th.remove();
  //       }
  //     });
  //     tempTable.appendChild(clonedThead);
  //   }

  //   // if (thead) {
  //   //   tempTable.appendChild(thead.cloneNode(true));
  //   // }

  //   // ใส่เฉพาะ row ที่เลือก
  //   // selectedRows.forEach(row => tempTable.appendChild(row.cloneNode(true)));
  //   selectedRows.forEach(row => {
  //     const clonedRow = row.cloneNode(true) as HTMLElement;
  //     clonedRow.querySelectorAll("td").forEach((td, index) => {
  //       if (["0", "1", "10", "13", "14", "15"].includes(index.toString())) {
  //         td.remove();
  //       }
  //     });
  //     tempTable.appendChild(clonedRow);
  //   });

  //   // แปลง table เป็น worksheet แล้ว export
  //   const ws: XLSX.WorkSheet = XLSX.utils.table_to_sheet(tempTable);
  //   const wb: XLSX.WorkBook = XLSX.utils.book_new();
  //   XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  //   XLSX.writeFile(wb, this.fileName);

  //     // highlight บนหน้าเว็บด้วย
  //   selectedRows.forEach(row => {
  //     row.querySelectorAll("td").forEach(td => td.style.backgroundColor = '#b6f0b6');
  //   });
  // }

  exportexcel() {
    // 1. ดึงเฉพาะแถวที่ checkbox = true จากรายการที่ผ่านการกรองแล้ว
    const selectedRequests = this.filteredRequests.filter(req => req.Selection);

    if (selectedRequests.length === 0) {
      Swal.fire({ icon: 'error', title: 'Oops...', text: 'Please select at least one item to complete.' });
      return;
    }

    // 2. สร้าง Workbook และ Worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    // 3. กำหนด Header และ Key (ลำดับคอลัมน์)
    worksheet.columns = [
      { header: 'DIVISION', key: 'DIVISION', width: 15 },
      { header: 'ITEM NO.', key: 'ITEM_NO', width: 20 },
      { header: 'MFG ORDER NO.', key: 'MFG_ORDER_NO', width: 25 },
      { header: 'DOCUMENT NO.', key: 'DOCUMENT_NO', width: 20 },
      { header: 'TRANSACTION(DMY)', key: 'TRANSACTION', width: 18 },
      { header: 'PART NO.', key: 'PART_NO', width: 22 },
      { header: 'Stock Location', key: 'Stock_Location', width: 18 },
      { header: 'MATL LOT', key: 'MATL_LOT', width: 15 },
      { header: 'ISSUE QTY', key: 'QTY', width: 12 },
      { header: 'M/C TYPE', key: 'MCType', width: 15 },
      { header: 'M/C NO.', key: 'MC_No', width: 15 },
      { header: 'M/C 6 DIGIT', key: 'MCNo6Digit', width: 18 },
      { header: 'DECLARATION NO', key: 'DECLATION_NO', width: 20 },
      { header: 'REMARK', key: 'REMARK', width: 25 }
    ];

    // 4. จัดรูปแบบ Header (ตัวหนา, จัดกลาง, พื้นหลังสีเหลือง)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // Yellow color
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // 5. เตรียมข้อมูล
    const cDateFormat = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}${mm}${dd}`;
    };

    const dataRows = selectedRequests.map(req => ({
      DIVISION: req.Division || '',
      ITEM_NO: req.ItemNo || '',
      MFG_ORDER_NO: req.MFG_Order_No || '',
      DOCUMENT_NO: req.DocNo || '',
      TRANSACTION: cDateFormat(req.DateComplete),
      PART_NO: req.PartNo || '',
      Stock_Location: req.Stock_Location || '',
      MATL_LOT: req.MatLot || '',
      QTY: req.QTY || 0,
      MCType: req.MCType || '',
      MC_No: req.MC_No || req.MCNo || '',
      MCNo6Digit: req.MCNo6Digit || req.MC6Digit || '',
      DECLATION_NO: '',
      REMARK: req.Remark || ''
    }));

    // 6. เพิ่มข้อมูลลงใน Worksheet
    worksheet.addRows(dataRows);

    // 7. ตั้งค่า AutoFilter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 14 } // จำนวนคอลัมน์ทั้งหมด (14 คอลัมน์รวม REMARK)
    };

    // 8. สร้างไฟล์และดาวน์โหลด
    workbook.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      fs.saveAs(blob, this.fileName);
    });
  }

  // // highlight บนหน้าเว็บ
  // selectedRows.forEach(row => {
  //   row.querySelectorAll("td").forEach(td => td.style.backgroundColor = '#b6f0b6');
  // });

  addTestMockData() {
    this.showMockOnly = !this.showMockOnly; // Toggle the view state

    // Do not automatically switch Division, let the user select it.

    this.isLoading = true;
    setTimeout(() => {
      this.onFilter(true);
      this.isLoading = false;
      this.cdr.markForCheck();
    }, 3000);

    if (this.showMockOnly) {
      Swal.fire({
        icon: 'info',
        title: '🧪 โหมดประวัติจำลอง',
        html: `แสดงเฉพาะ <b>ข้อมูลจำลอง (แถบแดง) ที่ถูกตัดสต็อกเรียบร้อยแล้ว</b><br><br>
        จำลองเสมือนว่าข้อมูลถูกส่งมาจากหน้า Request List เข้าสู่ระบบ ISSUE AS400<br>
        (ข้อมูลจริงถูกซ่อนไว้ชั่วคราว กดปุ่ม <b>ประวัติจำลอง</b> อีกครั้งเพื่อกลับหน้าปกติ)`,
        confirmButtonText: 'รับทราบ'
      });
    }
  }

  toggleAutoFire() {
    if (!this.isAdmin()) return;
    const originalState = this.isAutoFireEnabled;
    this.isAutoFireEnabled = !this.isAutoFireEnabled;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('as400AutoFireEnabled', String(this.isAutoFireEnabled));
    }
    this.purchasehistory.updateAutoFireConfig(this.isAutoFireEnabled).subscribe({
      next: () => {
        if (this.isAutoFireEnabled) {
          // คัดเลือกเฉพาะรายการ PENDING ของเดือนปัจจุบันที่มีของพร้อมตัด (On-Hand >= QTY) และมีเลขชั้นวาง
          this.filteredRequests.forEach(req => {
            const hasStock = Number(req.ON_HAND ?? req.STOCK_ON_HAND ?? 0) >= Number(req.QTY ?? 1);
            const hasLoc = !!(req.Stock_Location && req.Stock_Location.trim() !== '');
            if (req.AS400STATUS === 'Pending' && this.isCurrentMonth(req.DateComplete || req.DateTime_Record) && hasStock && hasLoc) {
              req.Selection = true;
            } else {
              req.Selection = false;
            }
          });
          const count = this.filteredRequests.filter(req => req.Selection).length;
          if (count > 0 && this.Division_) {
            Swal.fire({
              icon: 'success',
              title: 'Auto API ON',
              text: `กำลังยิงตัดเฉพาะรายการที่มีของพร้อมตัด (${count} รายการ)...`,
              timer: 2000,
              showConfirmButton: false
            });
            setTimeout(() => this.exportas400(true), 2000);
          } else {
            Swal.fire({
              icon: 'success',
              title: 'Auto API ON',
              text: 'เปิดระบบ Auto API สำเร็จ (ระบบจะคอยตัดเฉพาะรายการที่มีของพร้อมให้อัตโนมัติ ส่วนรายการที่ของหมดจะคงไว้ในหน้ารอตัด)',
              timer: 3000,
              showConfirmButton: false
            });
          }
        } else {
          Swal.fire({ icon: 'info', title: 'Auto API OFF', text: 'ปิดระบบ Auto ยิง API แล้ว (ข้อมูลจะค้างเป็น PENDING)', timer: 2000, showConfirmButton: false });
        }
      },
      error: (err) => {
        console.error('Failed to update Auto API state:', err);
        this.isAutoFireEnabled = originalState; // rollback UI
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('as400AutoFireEnabled', String(this.isAutoFireEnabled));
        }
        Swal.fire({ icon: 'error', title: 'Error', text: 'เชื่อมต่อ API ล้มเหลว' });
      }
    });
  }

  isCurrentMonth(dateStr: string): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  formatYYMMDD(dateStr: any): string {
    if (!dateStr) return '';
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return '';
    const yy = String(dateObj.getFullYear()).slice(-2);
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  getEffectiveDueDate(item: any): string {
    if (!item) return '-';

    if (item.DueDate) {
      const formatted = this.formatYYMMDD(item.DueDate);
      if (formatted) return formatted;
    }

    const docStr = String(item.DocNo || '').trim();
    if (docStr.length >= 6) {
      const lastSix = docStr.slice(-6);
      if (/^\d{6}$/.test(lastSix)) {
        return lastSix;
      }
    }

    if (item.DateTime_Record) {
      const reqDate = new Date(item.DateTime_Record);
      reqDate.setDate(reqDate.getDate() + 7);
      return this.formatYYMMDD(reqDate);
    }

    return '-';
  }

  getEffectiveDocNo(item: any): string {
    if (!item || !item.DocNo) return '';
    const doc = String(item.DocNo).trim();

    const effectiveDate = this.getEffectiveDueDate(item);
    if (effectiveDate && effectiveDate !== '-' && doc.length >= 6) {
      const basePrefix = doc.slice(0, -6);
      const lastSix = doc.slice(-6);
      if (/^\d{6}$/.test(lastSix)) {
        return basePrefix + effectiveDate;
      }
    }
    return doc;
  }

  exportas400(isAutoTrigger: boolean = false) {
    // 1. ตรวจสอบการเลือกรายการ (ดึงเฉพาะรายการที่กรองอยู่ในหน้าปัจจุบัน)
    let selectedRequests = this.filteredRequests.filter(req => req.Selection);

    // ห้ามยิงข้อมูลเดือนเก่าเด็ดขาด (เฉพาะออโต้)
    const initialCount = selectedRequests.length;
    if (isAutoTrigger) {
      selectedRequests = selectedRequests.filter(req => {
        const targetDate = req.DateComplete || req.DateTime_Record;
        return this.isCurrentMonth(targetDate);
      });
    }

    if (initialCount > 0 && selectedRequests.length === 0) {
      Swal.fire({ icon: 'error', title: 'ไม่อนุญาตให้ยิงข้ามเดือน', text: 'ข้อมูลที่คุณเลือกเป็นของเดือนที่แล้ว (หรือเก่ากว่า) ระบบจะล็อคไม่ให้ยิงไป AS400 เด็ดขาด' });
      return;
    }

    if (selectedRequests.length === 0) {
      Swal.fire({ icon: 'error', title: 'Oops...', text: 'Please select at least one item.' });
      return;
    }

    // 🛡️ ป้องกันความปลอดภัย: คัดกรองเฉพาะรายการที่มีของพร้อมตัด (On-Hand >= QTY) และมีเลขชั้นวางเท่านั้น
    const readyRequests = selectedRequests.filter(req => {
      const onHand = Number(req.ON_HAND ?? req.STOCK_ON_HAND ?? 0);
      const qty = Number(req.QTY ?? 1);
      const hasLoc = !!(req.Stock_Location && req.Stock_Location.trim() !== '');
      return onHand >= qty && hasLoc;
    });

    const unreadyCount = selectedRequests.length - readyRequests.length;

    if (readyRequests.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีรายการที่มีของพร้อมตัด',
        text: 'รายการที่เลือกทั้งหมดไม่มีสต็อก หรือสต็อกไม่พอตัด หรือยังไม่มีเลขชั้นวาง ระบบจะคงไว้ในสถานะ "รอตัด (PENDING)" ตามเดิม'
      });
      return;
    }

    if (!isAutoTrigger && unreadyCount > 0) {
      Swal.fire({
        icon: 'info',
        title: 'ตัดเฉพาะรายการที่มีของพร้อม',
        text: `ตรวจพบ ${unreadyCount} รายการที่ของหมดหรือไม่พอตัด ระบบจะคงไว้ในหน้ารอตัด (PENDING) และจะส่งตัดเฉพาะ ${readyRequests.length} รายการที่มีของพร้อมตัด`,
        timer: 3000,
        showConfirmButton: false
      });
    }

    selectedRequests = readyRequests;

    if (!this.Division_) {
      Swal.fire({ icon: 'error', title: 'Oops...', text: 'Please select Division first.' });
      return;
    }

    // 2. Map ข้อมูลสำหรับ AS400 API
    const mappedData = selectedRequests.map(req => {
      // ใช้วันที่ปัจจุบัน (วันที่กดตัดสต๊อกจริงๆ) แทนวันที่เก่าของ Request
      const d = new Date();
      let warehouseVal = "";
      const divCode = (req.Division || this.Division_ || '').toString().trim();
      if (divCode === '7122' || divCode === 'GM') {
        warehouseVal = "A";
      } else if (divCode === '71DZ' || divCode === 'PMC') {
        const isSetup = req.ToolType === 'Setup' || req.ToolingType === 'SetupTool' || (req.Public_Id && req.Public_Id.startsWith('S'));
        const isCutting = req.ToolType === 'Cutting' || req.ToolingType === 'CuttingTool' || (req.Public_Id && req.Public_Id.startsWith('C'));
        if (isSetup) {
          warehouseVal = "F";
        } else if (isCutting) {
          warehouseVal = "C";
        } else {
          warehouseVal = "C"; // fallback
        }
      }

      return Object.assign({}, (() => {
        const finalDocNo = req.DocNo || "";
        let transYear = d.getFullYear().toString();
        let transMonth = (d.getMonth() + 1).toString().padStart(2, '0');
        let transDay = d.getDate().toString().padStart(2, '0');

        if (finalDocNo.length >= 6) {
          const lastSix = finalDocNo.slice(-6);
          if (/^\d{6}$/.test(lastSix)) {
            transYear = '20' + lastSix.substring(0, 2);
            transMonth = lastSix.substring(2, 4);
            transDay = lastSix.substring(4, 6);
          }
        }

        return {
          "ItemNo": req.ItemNo || "",
          "ItemRevision": "",
          "Quantity": req.QTY || 0,
          "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
          "DOCNo": finalDocNo,
          "TransactionYear": d.getFullYear().toString(),
          "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
          "TransactionDay": d.getDate().toString().padStart(2, '0'),
          "WareHouse": warehouseVal,
          "StockControl": "",
          "StockLocation": req.Stock_Location || "",
          "MaterialLot": req.MatLot || "",
          "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFG_Order_No || "") : (req.PartNo || ""),
          "Vendor": "",
          "EmpID": this.as400Config.employeeId || "",
          "Pcname": this.as400Config.pcName || "",
          "MCNo6Digit": req.MCNo6Digit || req.MC6Digit || "",
          "MC_No": req.MC_No || req.MCNo || "",
          "MCType": req.MCType || "",
          "Public_Id": req.Public_Id,
          "isMockTest": !!req.isMockTest
        };
      })());
    });

    // console.log('Mapped AS400 Payload to export:', mappedData);

    // 3. ยืนยันการส่ง
    // ถ้าเป็น Auto Trigger ให้แสดง Popup แจ้งกำลังตัดสต็อกอัตโนมัติทันที (ไม่ถาม confirm)
    if (isAutoTrigger) {
      Swal.fire({
        title: '🔵 กำลังตัดสต็อกอัตโนมัติ...',
        html: `
          <p style="margin-bottom:24px;">ระบบ Auto API กำลังส่งข้อมูล <b>${selectedRequests.length} รายการ</b> ไปยัง AS400<br>กรุณารอสักครู่...</p>
          <style>
            .swal-boxes{--size:32px;--duration:800ms;height:calc(var(--size)*2);width:calc(var(--size)*3);position:relative;transform-style:preserve-3d;transform-origin:50% 50%;margin:0 auto;margin-top:calc(var(--size)*1.5*-1);transform:rotateX(60deg) rotateZ(45deg) rotateY(0deg) translateZ(0)}
            .swal-boxes .swal-box{width:var(--size);height:var(--size);top:0;left:0;position:absolute;transform-style:preserve-3d}
            .swal-boxes .swal-box:nth-child(1){transform:translate(100%,0);animation:sbox1 var(--duration) linear infinite}
            .swal-boxes .swal-box:nth-child(2){transform:translate(0,100%);animation:sbox2 var(--duration) linear infinite}
            .swal-boxes .swal-box:nth-child(3){transform:translate(100%,100%);animation:sbox3 var(--duration) linear infinite}
            .swal-boxes .swal-box:nth-child(4){transform:translate(200%,0);animation:sbox4 var(--duration) linear infinite}
            .swal-boxes .swal-box>div{--bg:#5C8DF6;--top:auto;--right:auto;--bottom:auto;--left:auto;--tz:calc(var(--size)/2);--ry:0deg;--rx:0deg;position:absolute;width:100%;height:100%;background:var(--bg);top:var(--top);right:var(--right);bottom:var(--bottom);left:var(--left);transform:rotateY(var(--ry)) rotateX(var(--rx)) translateZ(var(--tz))}
            .swal-boxes .swal-box>div:nth-child(1){--top:0;--left:0}
            .swal-boxes .swal-box>div:nth-child(2){--bg:#145af2;--right:0;--ry:90deg}
            .swal-boxes .swal-box>div:nth-child(3){--bg:#447cf5;--rx:-90deg}
            .swal-boxes .swal-box>div:nth-child(4){--bg:#DBE3F4;--top:0;--left:0;--tz:calc(var(--size)*3*-1)}
            @keyframes sbox1{0%,50%{transform:translate(100%,0)}100%{transform:translate(200%,0)}}
            @keyframes sbox2{0%{transform:translate(0,100%)}50%{transform:translate(0,0)}100%{transform:translate(100%,0)}}
            @keyframes sbox3{0%,50%{transform:translate(100%,100%)}100%{transform:translate(0,100%)}}
            @keyframes sbox4{0%{transform:translate(200%,0)}50%{transform:translate(200%,100%)}100%{transform:translate(100%,100%)}}
          </style>
          <div style="padding-top:40px;">
            <div class="swal-boxes">
              <div class="swal-box"><div></div><div></div><div></div><div></div></div>
              <div class="swal-box"><div></div><div></div><div></div><div></div></div>
              <div class="swal-box"><div></div><div></div><div></div><div></div></div>
              <div class="swal-box"><div></div><div></div><div></div><div></div></div>
            </div>
          </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
      });
      this.purchasehistory.exportToAS400(this.Division_!, mappedData).subscribe({
        next: (response: any) => {
          const apiResults = response.response;
          let failedItemsCount = 0;
          let successItemsCount = 0;
          if (Array.isArray(apiResults)) {
            apiResults.forEach((resItem: any) => {
              const match = selectedRequests.find(r => r.Public_Id === resItem.Public_Id);
              if (match) {
                if (resItem.status === 'success' || resItem.AS400STATUS === 'DONE') {
                  successItemsCount++;
                  match.AS400STATUS = 'DONE';
                } else {
                  failedItemsCount++;
                  match.AS400STATUS = 'FAIL';
                }
              }
            });
          } else {
            successItemsCount = selectedRequests.length;
            selectedRequests.forEach(r => r.AS400STATUS = 'DONE');
          }
          if (failedItemsCount > 0) {
            Swal.fire({
              icon: 'warning',
              title: `⚠️ Auto API เสร็จสิ้น (บางส่วนล้มเหลว)`,
              html: `สำเร็จ: <b>${successItemsCount} รายการ</b><br>ล้มเหลว: <b>${failedItemsCount} รายการ</b>`,
              timer: 4000,
              showConfirmButton: true,
              confirmButtonText: 'ตกลง'
            });
          } else {
            Swal.fire({
              icon: 'success',
              title: '✅ Auto API สำเร็จ!',
              html: `ตัดสต็อก <b>${successItemsCount} รายการ</b> เสร็จเรียบร้อยแล้วครับ`,
              timer: 3000,
              showConfirmButton: false
            });
          }
          this.loadPurchaseHistory();
        },
        error: (err) => {
          Swal.fire({
            icon: 'error',
            title: '❌ Auto API ล้มเหลว',
            text: err?.error?.details || err?.error?.error || 'ไม่สามารถเชื่อมต่อ AS400 ได้'
          });
        }
      });
      return;
    }

    if (this.showMockOnly) {
      // Mock / Dry Run logic
      this.purchasehistory.exportToAS400(this.Division_!, mappedData).subscribe({
        next: (res) => {
          const remainingMocks = this.filteredRequests.filter(r => r.isMockTest && !r.Selection).length;
          this.testCutLogs.unshift({
            action: 'Mock AS400 Execution',
            time: new Date().toLocaleTimeString('th-TH'),
            cutCount: selectedRequests.length,
            cutItems: selectedRequests.map(r => r.ItemNo),
            remainingMockCount: remainingMocks
          });

          Swal.fire({
            icon: 'success',
            title: '✅ DRY RUN SUCCESS / อนุมัติการตัดเทียมสำเร็จ',
            html: `จำลองการตัดสต็อกไปยัง <b>Backend & AS400</b> สำเร็จแล้ว!<br><br>
                   - ส่งข้อมูลจำลองจำนวน: <b>${selectedRequests.length} รายการ</b><br>
                   - ฐานข้อมูลที่ถูกจำลองการแก้: <code>TestIssueAs400</code><br>
                   - ผลกระทบต่อ AS400/DB ของจริง: <b>0%</b>`,
            confirmButtonText: 'ตกลง'
          }).then(() => {
            // Remove the cut mock items from the UI to simulate successful stock cut
            this.requests = this.requests.filter(req => !selectedRequests.includes(req));
            this.selectAllCheck = false;
            this.onFilter(false);
          });
        },
        error: (err) => {
          Swal.fire({ icon: 'error', title: 'Dry Run Error', text: err.message });
        }
      });
      return;
    }

    // Real Run Logic
    // 3.1 Pre-validation: Check if any item has 0 On-Hand or missing Stock Location
    const invalidItems = selectedRequests.filter(req => {
      const onHand = req.ON_HAND ?? req.STOCK_ON_HAND ?? 0;
      const isMissingLoc = !req.Stock_Location || req.Stock_Location.trim() === '' || req.isMissingLocation;
      return onHand <= 0 || isMissingLoc;
    });

    if (invalidItems.length > 0) {
      // Mark invalid ones as FAIL locally so they show red badges in the UI immediately
      invalidItems.forEach(req => {
        req.AS400STATUS = 'FAIL';
      });

      const detailsHtml = invalidItems.map(item => {
        const onHand = item.ON_HAND ?? item.STOCK_ON_HAND ?? 0;
        const reasons: string[] = [];
        if (onHand <= 0) reasons.push('ไม่มีของในสต็อก (On-Hand <= 0)');
        if (!item.Stock_Location || item.Stock_Location.trim() === '' || item.isMissingLocation) {
          reasons.push('ตำแหน่งจัดเก็บไม่ถูกต้อง (Invalid Stock Location)');
        }
        return `• <b>${item.ItemNo}</b>: ${reasons.join(' หรือ ')}`;
      }).join('<br>');

      Swal.fire({
        icon: 'error',
        title: 'การตัดสต็อกล้มเหลว <br> (Export FAIL )',
        html: `พบรายการที่ไม่สามารถดำเนินการได้เนื่องจากข้อมูลไม่ครบถ้วน:<br><br>${detailsHtml}`,
        confirmButtonText: 'ตกลง'
      });
      return;
    }

    Swal.fire({
      title: 'Export to AS400',
      text: `Are you sure you want to export ${selectedRequests.length} items to AS400 (${this.Division_ === '7122' ? 'GM' : 'PMC'})?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, export!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: 'Processing...',
          text: 'Please wait while we export data to AS400.',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        // 4. เรียก Backend API
        this.purchasehistory.exportToAS400(this.Division_!, mappedData).subscribe({
          next: (response: any) => {
            const apiResults = response.response;
            let failedItemsCount = 0;
            let successItemsCount = 0;
            let failureDetails = '';

            selectedRequests.forEach(req => {
              let isItemFailed = false;
              if (Array.isArray(apiResults)) {
                const match = apiResults.find(resItem =>
                  resItem && resItem.itemno && resItem.itemno.toString().trim().toLowerCase() === (req.ItemNo || '').toString().trim().toLowerCase()
                );
                if (match && match.message && match.message.toString().trim().toLowerCase() !== 'success') {
                  isItemFailed = true;
                  req.AS400STATUS = 'FAIL';
                  const rawMsg = match.message || '';
                  const lowerMsg = rawMsg.toLowerCase();
                  let reasonText = `AS400 ปฏิเสธ: ${rawMsg}`;
                  if (lowerMsg.includes('on hand') || lowerMsg.includes('onhand') || lowerMsg.includes('stock')) {
                    reasonText = `On-Hand ไม่พอตัด (${rawMsg})`;
                  } else if (lowerMsg.includes('item') || lowerMsg.includes('master') || lowerMsg.includes('not found')) {
                    reasonText = `ไม่พบข้อมูล Item ใน Master (${rawMsg})`;
                  } else if (lowerMsg.includes('loc') || lowerMsg.includes('warehouse')) {
                    reasonText = `Location หรือคลังไม่ถูกต้อง (${rawMsg})`;
                  }
                  req.Comment_Status = reasonText;
                  failureDetails += `• <b>${req.ItemNo}</b> (${req.DocNo || '-'}): <span style="color: #ef4444; font-weight: 600;">${reasonText}</span><br>`;
                  failedItemsCount++;
                }
              }
              if (!isItemFailed) {
                req.AS400STATUS = 'DONE';
                req.Comment_Status = 'ตัดสำเร็จ (Success)';
                successItemsCount++;
              }
            });

            if (isPlatformBrowser(this.platformId)) {

            }

            if (failedItemsCount > 0) {
              Swal.fire({
                icon: 'error',
                title: 'การส่งออก AS400 ล้มเหลวบางรายการ (Export Partially Failed)',
                html: `ส่งออกทั้งหมด ${selectedRequests.length} รายการ:<br>` +
                  `- สำเร็จ: <b style="color: #16a34a;">${successItemsCount} รายการ</b><br>` +
                  `- ล้มเหลว: <b style="color: #ef4444;">${failedItemsCount} รายการ</b><br><br>` +
                  `<div style="text-align: left; background: #fff5f5; border: 1px solid #fed7d7; padding: 10px; border-radius: 6px; font-size: 13px;">` +
                  `<b>รายละเอียดและสาเหตุข้อผิดพลาด:</b><br>${failureDetails}` +
                  `</div>`,
                confirmButtonText: 'ตกลง'
              }).then(() => {
                this.loadPurchaseHistory(() => {
                  this.requests.forEach(req => {
                    const match = selectedRequests.find(r => r.Public_Id === req.Public_Id);
                    if (match) {
                      req.Selection = match.AS400STATUS === 'FAIL';
                    }
                  });
                  this.selectAllCheck = false;
                  if (isPlatformBrowser(this.platformId)) {

                  }
                  this.onFilter(false);
                });
              });
            } else {
              Swal.fire({
                icon: 'success',
                title: 'Success!',
                text: 'Data has been exported to AS400 successfully.',
                timer: 1500,
                showConfirmButton: false
              }).then(() => {
                this.loadPurchaseHistory(() => {
                  this.requests.forEach(req => {
                    const match = selectedRequests.find(r => r.Public_Id === req.Public_Id);
                    if (match) {
                      req.Selection = false;
                    }
                  });
                  this.selectAllCheck = false;
                  if (isPlatformBrowser(this.platformId)) {

                  }
                  this.onFilter(false);
                });
              });
            }
          },
          error: (err: any) => {

            console.error('AS400 Export Error:', err);
            selectedRequests.forEach(req => {
              req.AS400STATUS = 'FAIL';
            });
            if (isPlatformBrowser(this.platformId)) {

            }
            Swal.fire({
              icon: 'error',
              title: 'Export Failed',
              text: err?.error?.details || err?.error?.error || 'Failed to connect to AS400 API.'
            }).then(() => {
              this.loadPurchaseHistory(() => {
                this.requests.forEach(req => {
                  const match = selectedRequests.find(r => r.Public_Id === req.Public_Id);
                  if (match) {
                    req.Selection = true;
                  }
                });
                this.onFilter(false);
              });
            });
          }
        });
      }
    });
  }

  showTestLogs() {
    if (this.testCutLogs.length === 0) {
      Swal.fire({
        icon: 'info',
        title: '📜 ประวัติการตัดทดสอบ (Test History Log)',
        text: 'ยังไม่มีประวัติการตัดทดสอบในเซสชันนี้ ลองติ๊กเลือกข้อมูลจำลอง (แถบแดง) แล้วกดปุ่ม ISSUE TO AS400 ดูครับ!'
      });
      return;
    }

    const logHtml = this.testCutLogs.map((log, index) => `
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: left; font-size: 13px;">
        <div style="font-weight: 700; color: #2563eb; display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">
          <span>#${this.testCutLogs.length - index} ${log.action}</span>
          <span style="color: #64748b; font-size: 12px;">⏰ ${log.time}</span>
        </div>
        <div style="margin-top: 6px; color: #0f172a;">
          • รายการที่ถูกตัดออกจริง: <b style="color: #ef4444;">${log.cutCount} รายการ</b> (${log.cutItems.join(', ')})<br>
          • รายการจำลองคงเหลือในตาราง: <b>${log.remainingMockCount} รายการ</b><br>
          • สถานะ DB จริง: <span class="badge bg-success" style="font-size: 11px;">0 DB Affected (Safe Test)</span>
        </div>
      </div>
    `).join('');

    Swal.fire({
      title: '📜 ประวัติการตัด (Dry Run Log)',
      html: `<div style="max-height: 400px; overflow-y: auto;">${logHtml}</div>`,
      width: '600px',
      confirmButtonText: 'ปิดหน้านี้'
    });
  }
}
