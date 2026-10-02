import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '../../../../environments/environment';
import Swal from 'sweetalert2';
import {
  sanitizeScan,
  isClearCommand,
  isCompletePaperBarcode,
  parsePaperBarcode as codecParsePaperBarcode,
  SHORT_CODE_RE,
  decodeShortCode
} from './barcodeCodec';

@Component({
  selector: 'app-document-return-issue',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, RouterModule],
  templateUrl: './document-return-issue.component.html',
  styleUrls: ['./document-return-issue.component.scss']
})
export class DocumentReturnIssueComponent implements OnInit, OnDestroy {
  apiUrl = environment.apiUrl;

  // Department / Header navigation
  selectedMainTab: 'Engineer' | 'PlanListEN' = 'Engineer';

  // Sub Tab Filters: 'active' | 'wait_issue' | 'issue_completed' | 'all'
  activeSubFilter: 'all' | 'active' | 'wait_issue' | 'issue_completed' = 'all';


  // Search & Date filters
  searchPartNo: string = '';
  searchProcess: string = '';
  searchDivision: string = 'PMC';
  startDate: string = '';
  endDate: string = '';

  // Stats
  stats = {
    totalEn: 0,
    returned: 0,
    waitIssue: 0,
    issueCompleted: 0
  };

  // Data List
  documentList: any[] = [];
  isLoading: boolean = false;
  isSaving: boolean = false;

  // PDF Preview Modal
  showPreviewModal: boolean = false;
  previewTitle: string = '';
  previewUrl: SafeResourceUrl | null = null;
  previewBlobUrl: string | null = null;

  // Print Preview & Action Modal State
  isPrintModalOpen: boolean = false;
  selectedItemForPrint: any = null;
  printDocType: 'dwg' | 'layout' | 'iiqc' = 'dwg';
  printPreviewUrl: SafeResourceUrl | null = null;
  printPreviewBlobUrl: string | null = null;
  isPdfLoading: boolean = false;
  previewZoom: number = 1;

  // Return Barcode Modal / Scanner (Two-Step Dual Verification)
  showReturnModal: boolean = false;
  showBarcodeZoomModal: boolean = false; // Popup ขยายบาร์โค้ดเต็มจอคมชัดพิเศษ
  isBarcodeZoomed: boolean = false;      // ขยายบาร์โค้ดขนาดใหญ่พิเศษสำหรับเครื่องสแกนขนาดเล็ก
  selectedItemForReturn: any = null;
  barcodeLoadError: boolean = false;
  isCopied: boolean = false;

  // Two-Step Dual Verification State (1: สแกนจอ, 2: สแกนกระดาษ)
  returnStep: 1 | 2 = 1;
  screenBarcode: string = '';
  paperBarcode: string = '';
  extractedPaperRev: string | null = null;
  isScreenLocked: boolean = false;
  verificationStatus: 'idle' | 'matched' | 'mismatched' = 'idle';
  mismatchMsg: string = '';

  // Return Success Countdown & Auto-close State (แสดงข้อมูลค้างไว้ 3 วิ พร้อมแทบแจ้งเตือน)
  returnCompletedSuccess: boolean = false;
  autoCloseCountdown: number = 3;
  autoCloseTimer: any = null;
  autoCloseInterval: any = null;
  private focusLockInterval: any = null;

  get scannedBarcode(): string {
    return this.screenBarcode || this.paperBarcode || '';
  }
  set scannedBarcode(val: string) {
    if (this.returnStep === 1) {
      this.screenBarcode = val;
    } else {
      this.paperBarcode = val;
    }
  }

  // Data Splitting & Processing (Architecture Branch 1: UI & Branch 2: DB)
  decodedBarcodeInfo: {
    rawBarcode: string;
    truncatedDisplay: string;
    partNo: string;
    mcType: string;
    mcNo: string;
    planDate: string;
    revision?: string;
    comment?: string;
    format: 'short_code' | 'pipe_separated' | 'other';
    matchedItem?: any;
  } | null = null;

  // Barcode Generation Mode: 'short' (รูปแบบใหม่ 14 หลัก: ENG25BW1278P01) or 'pipe' (รูปแบบเดิม: 260925|260925|BW12|78)
  barcodeDisplayMode: 'short' | 'pipe' = 'short';

  // Side Return Complete Toast ("ข้างๆจอให้เห็น")
  showSideToast: boolean = false;
  lastReturnedInfo: any = null;
  sideToastTimer: any = null;

  // Scanner Keyboard Buffer
  barcodeBuffer: string = '';
  lastScanTimestamp: number = 0;
  paperAutoDebounceTimer: any = null;

  // isProcessing: guard against double-save (Enter + debounce race)
  // Do NOT set [disabled] on the input while saving — it kills focus permanently.
  isProcessing: boolean = false;

  // ─── Scan Debug Panel (Requirement 1) ──────────────────────────────────────
  showScanDebug: boolean = true; // เปิด/ปิดได้ด้วย flag showScanDebug = true
  isDebugMinimized: boolean = false;
  debugRecentKeys: { key: string; time: string; target: string }[] = [];
  debugActiveElementInfo: string = 'None';
  debugIsStep2Disabled: boolean = false;
  // ViewChild for programmatic focus control
  @ViewChild('paperBarcodeInputRef') paperBarcodeInputRef!: ElementRef<HTMLInputElement>;

  // User Info
  currentUser: string = 'EN User';

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  private eventSource: EventSource | null = null;

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.resolveCurrentUser();
      this.loadData();
      this.initSSE();
    }
  }

  private initSSE(): void {
    try {
      this.eventSource = new EventSource(`${this.apiUrl}/events/planlist`);
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && (data.action === 'RETURN_COMPLETE' || data.type === 'PLANLIST_UPDATE')) {
            this.loadData();
          }
        } catch (_) {}
      };
      this.eventSource.onerror = () => {
        // EventSource will auto-reconnect
      };
    } catch (_) {}
  }

  resolveCurrentUser(): void {
    try {
      const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        this.currentUser = (user.Employee_Name || user.employee_name || user.username || user.Username || user.name || user.Name || user.DisplayName || user.Employee_ID || 'EN User').trim();
        if (user.Division && (user.Division.toUpperCase() === 'GM' || user.Division.toUpperCase() === 'PMC')) {
          this.searchDivision = user.Division.toUpperCase();
        }
      }
    } catch (_) {
      this.currentUser = 'EN User';
    }
  }

  // Known DWG Revisions visually verified from physical drawing title blocks & sheets
  knownDwgRevs: Record<string, string> = {
    'T7071-G1BS01': 'O',
    'A5D21-2-G1A': 'NR',
    'A5B34-1-G1A': 'NR',
    'A5C21-2CG1A': 'C',
    'A5C62-2-F1A': 'C',
    'A5C68-1-G1AS01': 'A',
    'A5D19-4-03F1B': 'A',
    'A5D46-2-G1C': 'B',
    'A6701-1-G1A': 'A',
    'T6001-01G1A': 'NR',
    'T7018AG1A': 'D',
    'T7025JG2AS01-T1': 'NR',
    'T7025JG3A-TN1': 'NR',
    'T7067AG2A': 'G',
    'T7067AG2AT01': 'B',
    'T7067AG2BT01': 'M',
    'T7068-G2A': 'NR',
    'T7069-G1B': 'G',
    'T7070-G1C': 'K',
    'T7070-G1CT01': 'A',
    'T7070-G1D': 'C',
    'T7070-G1DS02': 'C',
    'T7071-G1ES03': 'O',
    'T7071-G1ET01': 'NR',
    'T7071-G1ET02': 'NR',
    'T7099AM1A': 'NR',
    'T7140-F2A': 'A',
    'T7205-F1A': 'B',
    'T9503AG1A': 'D'
  };

  // Drawing / Layout Document Single Revision extractor
  extractSingleRev(revCol: any, filePath?: string): string {
    const clean = (revCol || '').toString().trim();
    if (clean && clean !== '-') return clean;

    if (!filePath) return '-';
    const cleanPath = filePath.replace(/["']/g, '');
    const filename = cleanPath.split(/[/\\]/).pop() || '';
    const baseName = filename.replace(/\.pdf$/i, '').trim();

    if (this.knownDwgRevs[baseName]) {
      return this.knownDwgRevs[baseName];
    }

    const m = filename.match(/(?:[(_\s-]|^)Rev\.?\s*([A-Za-z0-9_-]+)/i);
    if (m && m[1]) {
      const captured = m[1].replace(/[)]$/, '').replace(/\.+$/, '').trim();
      if (captured.toLowerCase() !== 'pdf') return captured;
    }
    return '-';
  }

  // Helper to format PC Plan timestamp (DateTime_Record) preserving exact Thai server time
  formatDateTimeRecord(val: any): string {
    if (!val) return '-';
    try {
      if (typeof val === 'string') {
        const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
        if (m) {
          return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
        }
      }
      const d = new Date(val);
      if (isNaN(d.getTime())) return '-';
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = pad(d.getUTCDate());
      const month = pad(d.getUTCMonth() + 1);
      const year = d.getUTCFullYear();
      const hours = pad(d.getUTCHours());
      const minutes = pad(d.getUTCMinutes());
      const seconds = pad(d.getUTCSeconds());
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (_) {
      return '-';
    }
  }

  // Helper to format Plan Setup date (วันที่ PC ต้องการ เช่น 30/09/2026)
  formatPlanDate(val: any): string {
    if (!val) return '-';
    try {
      if (typeof val === 'string') {
        const str = val.trim();
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
          return str;
        }
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          return `${m[3]}/${m[2]}/${m[1]}`;
        }
      }
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    } catch (_) {
      return String(val);
    }
  }

  // Helper to format any date to YYYY-MM-DD
  toIsoDateStr(dateVal: any): string {
    if (!dateVal) return 'NODATE';
    try {
      if (typeof dateVal === 'string') {
        const trimmed = dateVal.trim();
        const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dmy) {
          return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        }
        const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
          return `${iso[1]}-${iso[2]}-${iso[3]}`;
        }
      }
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return 'NODATE';
    } catch (_) {
      return 'NODATE';
    }
  }

  // Helper to format date to YYMMDD (เช่น 2026-09-18 -> 260918 ตามคำสั่ง "เอา 2026 เปลี่ยนเป็น 26เดือนวัน")
  toShortDateStr(dateVal: any): string {
    const iso = this.toIsoDateStr(dateVal);
    if (!iso || iso === 'NODATE') return 'NODATE';
    const m = iso.match(/^(\d{2})(\d{2})-(\d{2})-(\d{2})/);
    if (m) {
      return `${m[2]}${m[3]}${m[4]}`; // '26' + '09' + '18' = '260918'
    }
    const clean = iso.replace(/-/g, '');
    if (clean.length === 8 && clean.startsWith('20')) {
      return clean.substring(2);
    }
    return clean;
  }

  // Helper to normalize any date string (6-digit 260930, 8-digit 20260930, or ISO 2026-09-30) to ISO YYYY-MM-DD
  normalizeDateStrToIso(dateStr: string): string {
    if (!dateStr || dateStr === 'NODATE') return '';
    const clean = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    if (/^\d{8}$/.test(clean)) {
      return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
    }
    if (/^\d{6}$/.test(clean)) {
      return `20${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 6)}`;
    }
    return clean;
  }

  // รูปแบบใหม่ Short Code 14 หลัก: เช่น "ENG25BW1278P01"
  formatShortCodeForItem(item: any): string {
    if (!item) return '';
    const planVal = item.PlanDate || item.planDate || item.date || item.DateTime_Record;
    let dayStr = '01';
    if (planVal) {
      const d = new Date(planVal);
      if (!isNaN(d.getTime())) {
        dayStr = String(d.getDate()).padStart(2, '0');
      } else {
        const iso = this.toIsoDateStr(planVal);
        const m = iso.match(/-(\d{2})$/);
        if (m) dayStr = m[1];
      }
    }

    let mc = (item.MCType || item.MC_Type || 'MC').trim().toUpperCase().replace(/[\s-]/g, '');
    let mcNo = (item.MCNo || item.MC_No || '01').trim().replace(/[\s,]/g, '');

    // Process/Part suffix: P01 หรือจาก Process ของชิ้นงาน
    let procSuffix = 'P01';
    if (item.Process && typeof item.Process === 'string') {
      const matchP = item.Process.match(/P\d+/i);
      if (matchP) procSuffix = matchP[0].toUpperCase();
    }

    return `ENG${dayStr}${mc}${mcNo}${procSuffix}`;
  }

  // รูปแบบเดิม Pipe Format: เช่น "260925|260925|BW12|78"
  formatPipeBarcodeForItem(item: any): string {
    if (!item) return '';
    const recVal = item.DateTime_Record || item.DateTimeRecordStr || item.recordTime || item.ScanTime || item.CreatedAt;
    const planVal = item.PlanDate || item.planDate || item.date;

    const recordDateShort = this.toShortDateStr(recVal) !== 'NODATE' 
      ? this.toShortDateStr(recVal) 
      : this.toShortDateStr(planVal);

    const planDateShort = this.toShortDateStr(planVal) !== 'NODATE'
      ? this.toShortDateStr(planVal)
      : recordDateShort;

    const mc = (item.MCType || item.MC_Type || '-').trim();

    let rawMcNo = (item.MCNo || item.MC_No || '-').trim();
    if (rawMcNo !== '-') {
      rawMcNo = rawMcNo.replace(/\s*,\s*/g, ',').replace(/\s+/g, '');
    }

    return `${recordDateShort}|${planDateShort}|${mc}|${rawMcNo}`;
  }

  formatBarcodeForItem(item: any): string {
    if (!item) return '';
    return this.barcodeDisplayMode === 'pipe' 
      ? this.formatPipeBarcodeForItem(item)
      : this.formatShortCodeForItem(item);
  }

  // Barcode printed onto physical paper drawing with DWG Revision attached (e.g. ENG30B2034P01-R0)
  formatPaperBarcodeForItem(item: any): string {
    if (!item) return '';
    const base = this.formatBarcodeForItem(item);
    const rev = (item.pathDwgRev || item.PathDwgRev || item.Revision || item.revision || '').toString().trim();
    if (!rev || rev === '-') {
      return `${base}-R0`;
    }
    const cleanRev = rev.replace(/^R/i, '').replace(/^REV/i, '').replace(/[:\-_]/g, '').trim();
    return `${base}-R${cleanRev || '0'}`;
  }

  // Parse paper barcode to extract base job key and physical paper drawing revision
  parsePaperBarcode(rawPaperCode: string): { baseBarcode: string; revision: string | null; isPaperKey: boolean } {
    const raw = this.cleanBarcodeString(rawPaperCode).trim();
    if (!raw) return { baseBarcode: '', revision: null, isPaperKey: false };

    // 1. Matches -R<rev> or -REV<rev> or /R<rev> or _R<rev> (e.g. ENG30B2034P01-R0, ENG30B2034P01-RA, ENG30B2034P01-REV0)
    const revMatch = raw.match(/[-/_|](?:R|REV)[:\-_]?([A-Za-z0-9]+)$/i);
    if (revMatch) {
      const base = raw.substring(0, revMatch.index).trim();
      const rev = revMatch[1].trim();
      return { baseBarcode: base, revision: rev, isPaperKey: true };
    }

    // 2. Matches pipe ending (e.g. 260930|260930|B20|34|0 or |R0)
    if (raw.includes('|')) {
      const parts = raw.split('|');
      if (parts.length >= 5) {
        const lastPart = parts[parts.length - 1].trim();
        const base = parts.slice(0, 4).join('|');
        const rev = lastPart.replace(/^R/i, '').replace(/^REV/i, '').replace(/[:\-_]/g, '').trim();
        return { baseBarcode: base, revision: rev, isPaperKey: true };
      }
    }

    // 3. Fallback: No revision suffix found (older printed paper backward compatibility)
    return { baseBarcode: raw, revision: null, isPaperKey: false };
  }

  toggleBarcodeMode(mode?: 'short' | 'pipe'): void {
    if (mode) {
      this.barcodeDisplayMode = mode;
    } else {
      this.barcodeDisplayMode = this.barcodeDisplayMode === 'short' ? 'pipe' : 'short';
    }
    if (this.selectedItemForReturn) {
      this.screenBarcode = this.formatBarcodeForItem(this.selectedItemForReturn);
      this.decodedBarcodeInfo = this.decodeBarcode(this.screenBarcode);
    }
    this.cdr.markForCheck();
  }

  loadData(): void {
    this.isLoading = true;
    this.http.get<any[]>(`${this.apiUrl}/engineer-return/history`).subscribe({
      next: (res) => {
        this.documentList = (res || []).map(item => {
          // Generate Barcode string: Date + Setup + MC + MC No (e.g. 2026-10-01|SET UP|BM165|370,371)
          const rawMcNo = item.MCNo || item.MC_No || '-';
          const formattedMcNo = rawMcNo !== '-' ? rawMcNo.replace(/,/g, ', ') : '-';
          const generatedBarcode = this.formatBarcodeForItem(item);

          // Format PC Plan recording timestamp preserving Thai server time
          const recordTime = item.DateTimeRecordStr || item.DateTime_Record || item.DateTimeRecord || item.ScanTime || item.PlanDate;
          const displayDate = this.formatDateTimeRecord(recordTime);

          const userWhoReturned = (item.ReturnBy && item.ReturnBy !== 'SYSTEM')
            ? item.ReturnBy
            : (item.ScannedBy && item.ScannedBy !== 'SYSTEM' ? item.ScannedBy : (item.scannedBy || ''));

          const planCount = Number(item.PlanDocCount || item.docCount || 1);
          const isComplete = (item.ReturnBalance || item['Return Balance'] || '').toLowerCase() === 'complete' 
            || (item.ActionType || '').toLowerCase() === 'return'
            || (userWhoReturned && userWhoReturned !== 'SYSTEM' && userWhoReturned !== '');

          let returnedCount = (item.ReturnedDocCount !== undefined && item.ReturnedDocCount !== null)
            ? Number(item.ReturnedDocCount)
            : (isComplete ? planCount : (item.ReturnQty && Number(item.ReturnQty) > 0 ? 1 : 0));

          if (isComplete && returnedCount < planCount) {
            returnedCount = planCount;
          }

          const isFullyReturned = (returnedCount >= planCount && returnedCount > 0) || isComplete;

          const pDwgRev = item.pathDwgRev ?? item.PathDwgRev ?? item.Path_Dwg_Rev;
          const pLayoutRev = item.pathLayoutRev ?? item.PathLayoutRev ?? item.Path_Layout_Rev;
          const dwgRev = this.extractSingleRev(pDwgRev, item.PathDwg || item.pathDwg);
          const layoutRev = this.extractSingleRev(pLayoutRev, item.PathLayout || item.pathLayout);
          const planSetupDate = this.formatPlanDate(item.PlanDate || item.planDate || item.Date || item.date);

          return {
            ...item,
            recordTime: recordTime,
            displayDate: displayDate,
            planSetupDate: planSetupDate,
            pathDwgRev: dwgRev,
            pathLayoutRev: layoutRev,
            PathDwgRev: dwgRev,
            PathLayoutRev: layoutRev,
            docRevision: dwgRev !== '-' ? dwgRev : layoutRev,
            formattedMcNo: formattedMcNo,
            barcode: generatedBarcode,
            planDocCount: planCount,
            returnedDocCount: returnedCount,
            isReturnComplete: isFullyReturned,
            returnBalance: isFullyReturned ? 'Complete' : (item.ReturnBalance || item['Return Balance'] || '-'),
            ScannedBy: userWhoReturned,
            ReturnBy: userWhoReturned,
            scannedBy: userWhoReturned
          };
        });

        this.calculateStats();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading engineer history data:', err);
        // Fallback to standard endpoint if history endpoint is loading
        this.fallbackLoadData();
      }
    });
  }

  private fallbackLoadData(): void {
    this.http.get<any[]>(`${this.apiUrl}/engineer-return`).subscribe({
      next: (res) => {
        this.documentList = (res || []).map(item => {
          const rawMcNo = item.MCNo || item.MC_No || '-';
          const formattedMcNo = rawMcNo !== '-' ? rawMcNo.replace(/,/g, ', ') : '-';
          const generatedBarcode = this.formatBarcodeForItem(item);

          const planCount = Number(item.PlanDocCount || 1);
          const isComplete = (item.ReturnBalance || item['Return Balance'] || '').toLowerCase() === 'complete';
          const returnedCount = (item.ReturnedDocCount !== undefined && item.ReturnedDocCount !== null)
            ? Number(item.ReturnedDocCount)
            : (isComplete ? planCount : 0);
          const isFullyReturned = (returnedCount >= planCount && returnedCount > 0) || isComplete;

          const pDwgRev = item.pathDwgRev ?? item.PathDwgRev ?? item.Path_Dwg_Rev;
          const pLayoutRev = item.pathLayoutRev ?? item.PathLayoutRev ?? item.Path_Layout_Rev;
          const dwgRev = this.extractSingleRev(pDwgRev, item.PathDwg || item.pathDwg);
          const layoutRev = this.extractSingleRev(pLayoutRev, item.PathLayout || item.pathLayout);

          const recordTime = item.DateTimeRecordStr || item.DateTime_Record || item.ScanTime || item.PlanDate;
          const displayDate = this.formatDateTimeRecord(recordTime);
          const planSetupDate = this.formatPlanDate(item.PlanDate || item.planDate || item.Date || item.date);

          return {
            ...item,
            recordTime: recordTime,
            displayDate: displayDate,
            planSetupDate: planSetupDate,
            pathDwgRev: dwgRev,
            pathLayoutRev: layoutRev,
            PathDwgRev: dwgRev,
            PathLayoutRev: layoutRev,
            docRevision: dwgRev !== '-' ? dwgRev : layoutRev,
            formattedMcNo: formattedMcNo,
            barcode: generatedBarcode,
            planDocCount: planCount,
            returnedDocCount: returnedCount,
            isReturnComplete: isFullyReturned,
            returnBalance: isFullyReturned ? 'Complete' : (item.ReturnBalance || item['Return Balance'] || '-')
          };
        });
        this.calculateStats();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Fallback error loading engineer return data:', err);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  onDivisionChange(): void {
    this.calculateStats();
  }

  calculateStats(): void {
    if (!this.searchDivision) {
      this.stats = { totalEn: 0, returned: 0, waitIssue: 0, issueCompleted: 0 };
      return;
    }

    const list = this.documentList.filter(d => (d.Division || '').toLowerCase() === this.searchDivision.toLowerCase());

    this.stats.totalEn = list.length;
    this.stats.returned = list.filter(d => 
      (d.returnBalance || '').toString().toLowerCase() === 'complete' || 
      (d.ActionType || '').toLowerCase() === 'return' ||
      d.ReturnQty > 0
    ).length;
    this.stats.waitIssue = list.filter(d => {
      const s = (d.Status || d.planStatus || '').toLowerCase();
      return s.includes('wait') || (s === 'active' && (d.returnBalance || '').toString().toLowerCase() !== 'complete');
    }).length;
    this.stats.issueCompleted = list.filter(d => 
      (d.Status || d.planStatus || '').toLowerCase() === 'issue completed' ||
      (d.returnBalance || '').toString().toLowerCase() === 'complete'
    ).length;
  }

  setSubFilter(filter: 'all' | 'active' | 'wait_issue' | 'issue_completed'): void {
    this.activeSubFilter = filter;
  }

  get hasFilter(): boolean {
    return !!(this.searchPartNo || this.searchProcess || this.startDate || this.endDate || this.activeSubFilter !== 'all');
  }

  clearFilters(): void {
    this.searchPartNo = '';
    this.searchProcess = '';
    this.startDate = '';
    this.endDate = '';
    this.activeSubFilter = 'all';
  }

  get filteredList(): any[] {
    if (!this.searchDivision) {
      return [];
    }

    const filtered = this.documentList.filter(item => {
      // Filter by Division
      if ((item.Division || '').toLowerCase() !== this.searchDivision.toLowerCase()) {
        return false;
      }

      // Filter by Status Pill
      const status = (item.Status || item.planStatus || 'Active').toLowerCase();
      const returnBal = (item.returnBalance || '').toString().toLowerCase();

      if (this.activeSubFilter === 'active' && status !== 'active' && returnBal === 'complete') {
        return false;
      }
      if (this.activeSubFilter === 'wait_issue' && !status.includes('wait')) {
        return false;
      }
      if (this.activeSubFilter === 'issue_completed' && status !== 'issue completed' && returnBal !== 'complete') {
        return false;
      }


      // Filter by Part No
      if (this.searchPartNo && !(item.PartNo || '').toLowerCase().includes(this.searchPartNo.toLowerCase().trim())) {
        return false;
      }

      // Filter by Process
      if (this.searchProcess && (item.Process || '').toLowerCase() !== this.searchProcess.toLowerCase()) {
        return false;
      }

      // Filter by Date Range
      if (this.startDate || this.endDate) {
        const itemDateStr = item.PlanDate || item.ScanTime || item.Date;
        if (itemDateStr) {
          const d = new Date(itemDateStr);
          if (this.startDate && d < new Date(this.startDate)) return false;
          if (this.endDate && d > new Date(this.endDate + 'T23:59:59')) return false;
        }
      }

      return true;
    });

    // เรียงจากวันใหม่ล่าสุดไปวันเก่า (ตามเวลาจริงที่ PC บันทึก DateTime_Record)
    return filtered.sort((a: any, b: any) => {
      const getTimestamp = (item: any): number => {
        const d = item.DateTime_Record || item.DateTimeRecordStr || item.recordTime || item.ScanTime || item.PlanDate || item.CreatedAt || item.Date;
        if (!d) return 0;
        const time = new Date(d).getTime();
        return isNaN(time) ? 0 : time;
      };

      const timeA = getTimestamp(a);
      const timeB = getTimestamp(b);
      if (timeB !== timeA) {
        return timeB - timeA;
      }

      const idA = Number(a.Plan_ID || (a.items && a.items[0]?.Plan_ID) || 0);
      const idB = Number(b.Plan_ID || (b.items && b.items[0]?.Plan_ID) || 0);
      return idB - idA;
    });
  }

  normalizePath(rawPath: any): string {
    if (!rawPath) return '';
    let p = String(rawPath).trim();
    p = p.replace(/^["']+|["']+$/g, '').trim();
    if (p.toLowerCase().startsWith('file:')) {
      p = decodeURIComponent(p.replace(/^file:[\\/]+/i, ''));
      p = '\\\\' + p.replace(/\//g, '\\');
    }
    return p;
  }

  // --- PDF View Handler ---
  onViewPdf(item: any, type: 'dwg' | 'layout'): void {
    const rawPath = type === 'dwg' ? item.PathDwg : item.PathLayout;
    const path = this.normalizePath(rawPath);
    if (!path || path === '-') {
      Swal.fire('ข้อผิดพลาด', 'ไม่พบไฟล์ Drawing / Layout สำหรับรายการนี้', 'warning');
      return;
    }

    const docNo = item.DocumentID || item.RequestNo || item.barcode;
    this.http.post<any>(`${this.apiUrl}/loadPdfFromPath`, {
      filePath: path,
      requestNo: docNo
    }).subscribe({
      next: (res) => {
        if (res && res.imageData) {
          const base64 = res.imageData.includes(',') ? res.imageData.split(',')[1] : res.imageData;
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          const blob = new Blob([bytes], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          if (this.previewBlobUrl) {
            URL.revokeObjectURL(this.previewBlobUrl);
          }
          this.previewBlobUrl = blobUrl;
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl + '#toolbar=1');
          this.previewTitle = `${type.toUpperCase()} Preview: ${item.PartNo || docNo}`;
          this.showPreviewModal = true;
          this.cdr.markForCheck();
        } else {
          Swal.fire('ข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ PDF ได้', 'error');
        }
      },
      error: () => {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเปิดอ่านไฟล์ PDF ที่ระบุได้', 'error');
      }
    });
  }

  closePreviewModal(): void {
    this.showPreviewModal = false;
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
  }

  // --- Barcode Return Modal Handler (Two-Step Dual Verification) ---
  openReturnModal(item?: any): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
      this.autoCloseInterval = null;
    }
    this.returnCompletedSuccess = false;
    this.autoCloseCountdown = 3;

    if (item) {
      this.selectedItemForReturn = item;
      this.screenBarcode = item.barcode || this.formatBarcodeForItem(item);
      this.decodedBarcodeInfo = this.decodeBarcode(this.screenBarcode);
    } else {
      this.selectedItemForReturn = null;
      this.screenBarcode = '';
      this.decodedBarcodeInfo = null;
    }
    this.isScreenLocked = false; // Step 1 is NOT locked yet until screen barcode is scanned!
    this.returnStep = 1;         // Wait for Step 1 screen scan
    this.paperBarcode = '';
    this.verificationStatus = 'idle';
    this.mismatchMsg = '';
    this.barcodeLoadError = false;
    this.showReturnModal = true;
    this.cdr.markForCheck();
  }

  closeReturnModal(): void {
    this.stopStep2FocusLock();
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
      this.autoCloseInterval = null;
    }
    this.returnCompletedSuccess = false;
    this.autoCloseCountdown = 3;

    this.showReturnModal = false;
    this.screenBarcode = '';
    this.paperBarcode = '';
    this.returnStep = 1;
    this.isScreenLocked = false;
    this.verificationStatus = 'idle';
    this.mismatchMsg = '';
    this.selectedItemForReturn = null;
    this.decodedBarcodeInfo = null;
    this.barcodeLoadError = false;
    this.cdr.markForCheck();
  }

  confirmScreenScan(): void {
    if (!this.screenBarcode && this.selectedItemForReturn) {
      this.screenBarcode = this.selectedItemForReturn.barcode || this.formatBarcodeForItem(this.selectedItemForReturn);
    }
    if (this.screenBarcode) {
      this.isScreenLocked = true;
      this.returnStep = 2;
      this.paperBarcode = '';
      this.verificationStatus = 'idle';
      this.mismatchMsg = '';
      this.decodedBarcodeInfo = this.decodeBarcode(this.screenBarcode);
      this.closeBarcodeZoom();
      this.cdr.detectChanges();

      this.startStep2FocusLock();

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'ล็อคข้อมูลหน้าจอแล้ว (จำค่าไว้แล้ว)',
        text: 'ไปสเต็ป 2: กรุณาสแกนบาร์โค้ดบนใบกระดาษ Drawing เพื่อยืนยัน',
        showConfirmButton: false,
        focusConfirm: false,
        returnFocus: false,
        timer: 1500,
        didClose: () => {
          if (this.showReturnModal && this.isScreenLocked) this.focusReturnInput();
        }
      });

      this.focusReturnInput();
    } else {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'ยังไม่มีข้อมูลบาร์โค้ดหน้าจอสำหรับล็อค',
        showConfirmButton: false,
        focusConfirm: false,
        returnFocus: false,
        timer: 2000
      });
    }
  }

  unlockScreenScan(): void {
    this.stopStep2FocusLock();
    this.isScreenLocked = false;
    this.returnStep = 1;
    this.paperBarcode = '';
    this.verificationStatus = 'idle';
    this.mismatchMsg = '';
    this.cdr.markForCheck();
    this.updateDebugState();
  }

  focusReturnInput(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.cdr.detectChanges();
    const getEl = () => this.paperBarcodeInputRef?.nativeElement
      ?? (document.getElementById('paperBarcodeInput') as HTMLInputElement | null);

    const el = getEl();
    if (el) {
      if (el.disabled) el.disabled = false;
      el.focus({ preventScroll: true });
    }
    setTimeout(() => {
      const elDelayed = getEl();
      if (elDelayed) {
        if (elDelayed.disabled) elDelayed.disabled = false;
        elDelayed.focus({ preventScroll: true });
      }
      this.updateDebugState();
    }, 50);
  }

  startStep2FocusLock(): void {
    this.stopStep2FocusLock();
    this.focusReturnInput();
    // Continuous gentle focus retention (runs every 350ms to keep blinking cursor active)
    this.focusLockInterval = setInterval(() => {
      this.maintainStep2Focus();
    }, 350);
  }

  stopStep2FocusLock(): void {
    if (this.focusLockInterval) {
      clearInterval(this.focusLockInterval);
      this.focusLockInterval = null;
    }
  }

  maintainStep2Focus(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.showReturnModal || !this.isScreenLocked || this.returnCompletedSuccess || this.showBarcodeZoomModal) {
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    const inputEl = this.paperBarcodeInputRef?.nativeElement
      ?? (document.getElementById('paperBarcodeInput') as HTMLInputElement | null);

    if (!inputEl) return;
    if (active === inputEl) return; // Already focused and blinking!

    // Check if user is clicking or interacting with an interactive control (button, link, another input)
    const isInteractive = active && (
      active.tagName === 'BUTTON' ||
      active.tagName === 'A' ||
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.closest('button') ||
      active.closest('.btn') ||
      active.getAttribute('role') === 'button'
    );

    // If active element is non-interactive (e.g. BODY, DIV, SPAN, P, TABLE), lock cursor back into Step 2!
    if (!isInteractive) {
      inputEl.focus({ preventScroll: true });
      this.updateDebugState();
    }
  }

  onPaperBarcodeBlur(event: FocusEvent): void {
    this.updateDebugState();
    if (!this.showReturnModal || !this.isScreenLocked || this.returnCompletedSuccess || this.showBarcodeZoomModal) {
      return;
    }

    const related = event.relatedTarget as HTMLElement | null;
    const isInteractive = related && (
      related.tagName === 'BUTTON' ||
      related.tagName === 'A' ||
      related.tagName === 'INPUT' ||
      related.tagName === 'TEXTAREA' ||
      related.tagName === 'SELECT' ||
      related.closest('button') ||
      related.closest('.btn') ||
      related.getAttribute('role') === 'button'
    );

    // If blur occurred because user clicked whitespace/card/body, restore focus immediately
    if (!isInteractive) {
      setTimeout(() => {
        if (this.showReturnModal && this.isScreenLocked && !this.returnCompletedSuccess && !this.showBarcodeZoomModal) {
          this.focusReturnInput();
        }
      }, 20);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.showReturnModal || !this.isScreenLocked || this.returnCompletedSuccess || this.showBarcodeZoomModal) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const isInteractive = target && (
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.closest('button') ||
      target.closest('.btn') ||
      target.closest('a') ||
      target.getAttribute('role') === 'button'
    );

    // If user clicked any non-interactive element (card, modal-body, text, whitespace), keep cursor blinking in Step 2
    if (!isInteractive) {
      this.focusReturnInput();
    }
  }

  clearDebugKeys(): void {
    this.debugRecentKeys = [];
    this.cdr.markForCheck();
  }

  updateDebugState(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const activeEl = document.activeElement as HTMLElement | null;
    this.debugActiveElementInfo = activeEl ? `${activeEl.tagName}${activeEl.id ? '#' + activeEl.id : ''}` : 'None';
    const inputEl = this.paperBarcodeInputRef?.nativeElement
      ?? (document.getElementById('paperBarcodeInput') as HTMLInputElement | null);
    this.debugIsStep2Disabled = inputEl ? inputEl.disabled : !this.isScreenLocked;
    this.cdr.markForCheck();
  }

  private recordDebugKey(event: KeyboardEvent): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const targetEl = event.target as HTMLElement | null;
    const activeEl = document.activeElement as HTMLElement | null;
    const targetDesc = targetEl ? `${targetEl.tagName}${targetEl.id ? '#' + targetEl.id : ''}` : 'null';
    const activeDesc = activeEl ? `${activeEl.tagName}${activeEl.id ? '#' + activeEl.id : ''}` : 'null';
    this.debugActiveElementInfo = activeDesc;

    const inputEl = this.paperBarcodeInputRef?.nativeElement
      ?? (document.getElementById('paperBarcodeInput') as HTMLInputElement | null);
    this.debugIsStep2Disabled = inputEl ? inputEl.disabled : !this.isScreenLocked;

    const now = new Date();
    const timeStr = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    this.debugRecentKeys.unshift({
      key: event.key === ' ' ? 'Space' : event.key,
      time: timeStr,
      target: targetDesc
    });
    if (this.debugRecentKeys.length > 20) {
      this.debugRecentKeys.pop();
    }
    this.cdr.markForCheck();
  }

  /**
   * cleanBarcodeString: thin wrapper → delegates to sanitizeScan() from barcodeCodec.
   * Kept for backward compatibility with existing call-sites.
   */
  cleanBarcodeString(raw: string): string {
    return sanitizeScan(raw);
  }

  // ─── resetAll: single central reset function ─────────────────────────────────
  /**
   * Clear ALL scanner state, timers, and UI.
   * Called by: ##CLEAR## barcode (from any path), closeReturnModal,
   * and any fatal scan error that needs a full reset.
   *
   * Important:
   *  - clears paperAutoDebounceTimer BEFORE resetting state so timer can't fire on empty barcode
   *  - resets isProcessing so a stuck API call doesn't permanently block the UI
   *  - focus is returned to a neutral state (no specific field)
   */
  resetAll(): void {
    this.stopStep2FocusLock();
    // 1. Cancel timers FIRST — prevent timer firing on empty state
    if (this.paperAutoDebounceTimer) {
      clearTimeout(this.paperAutoDebounceTimer);
      this.paperAutoDebounceTimer = null;
    }
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
      this.autoCloseInterval = null;
    }
    this.returnCompletedSuccess = false;
    this.autoCloseCountdown = 3;
    this.barcodeBuffer = '';
    this.lastScanTimestamp = 0;

    // 2. Reset processing guard
    this.isProcessing = false;
    this.isSaving = false;

    // 3. Reset verification state
    this.screenBarcode = '';
    this.paperBarcode = '';
    this.returnStep = 1;
    this.isScreenLocked = false;
    this.verificationStatus = 'idle';
    this.mismatchMsg = '';
    this.extractedPaperRev = null;
    this.decodedBarcodeInfo = null;

    // 4. Close modals
    this.showReturnModal = false;
    this.showBarcodeZoomModal = false;
    this.selectedItemForReturn = null;
    this.barcodeLoadError = false;

    this.cdr.markForCheck();

    // 5. Brief toast (non-blocking — does NOT steal focus from next scan)
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: '🔄 Reset สำเร็จ',
      text: 'ล้างข้อมูลทั้งหมดแล้ว พร้อมสแกนใหม่',
      showConfirmButton: false,
      timer: 1500,
      focusConfirm: false
    });

    // 6. Return focus to Step 1 / scanner target after modal and toast
    setTimeout(() => {
      const searchEl = document.querySelector('.uiverse-input') as HTMLElement | null;
      if (searchEl) {
        searchEl.focus();
      }
    }, 0);
  }


  // Step 1: Handle scan off monitor screen
  onScreenBarcodeScanned(scannedCode: string): void {
    const code = this.cleanBarcodeString(scannedCode);
    if (!code) return;

    const decoded = this.decodeBarcode(code);
    this.decodedBarcodeInfo = decoded;

    // Case A: Modal is open and displaying a screenBarcode
    if (this.showReturnModal && this.screenBarcode) {
      const isMatch = this.checkBarcodeMatch(this.screenBarcode, code);
      if (isMatch) {
        this.isScreenLocked = true;
        this.returnStep = 2;
        this.paperBarcode = '';
        this.verificationStatus = 'idle';
        this.mismatchMsg = '';
        this.closeBarcodeZoom();
        this.cdr.detectChanges();

        this.startStep2FocusLock();

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'ล็อคข้อมูลหน้าจอสำเร็จ! (Step 1 Complete)',
          text: 'กรุณาสแกนบาร์โค้ดจากใบกระดาษที่นำมาส่ง (Step 2)',
          showConfirmButton: false,
          focusConfirm: false,
          returnFocus: false,
          timer: 2000,
          timerProgressBar: true,
          didClose: () => {
            if (this.showReturnModal && this.isScreenLocked) this.focusReturnInput();
          }
        });

        this.focusReturnInput();
        return;
      }
    }

    // Case B: Search item in documentList
    const foundItem = decoded.matchedItem || this.findItemByBarcode(code);
    if (foundItem) {
      this.selectedItemForReturn = foundItem;
      this.screenBarcode = foundItem.barcode || this.formatBarcodeForItem(foundItem) || code;
      this.isScreenLocked = true;
      this.returnStep = 2;
      this.paperBarcode = '';
      this.verificationStatus = 'idle';
      this.mismatchMsg = '';
      this.closeBarcodeZoom();
      this.showReturnModal = true;
      this.cdr.detectChanges();

      this.startStep2FocusLock();

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'ล็อคข้อมูลหน้าจอสำเร็จ! (Step 1 Complete)',
        text: 'กรุณาสแกนบาร์โค้ดจากใบกระดาษที่นำมาส่ง (Step 2)',
        showConfirmButton: false,
        focusConfirm: false,
        returnFocus: false,
        timer: 2000,
        timerProgressBar: true,
        didClose: () => {
          if (this.showReturnModal && this.isScreenLocked) this.focusReturnInput();
        }
      });

      this.focusReturnInput();
    } else {
      if (this.showReturnModal) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'warning',
          title: 'บาร์โค้ดไม่ตรงกับหน้าจอ',
          text: 'กรุณายิงบาร์โค้ดที่แสดงอยู่บนหน้าจอ',
          showConfirmButton: false,
          focusConfirm: false,
          returnFocus: false,
          timer: 3000
        });
      } else {
        this.selectedItemForReturn = {
          PartNo: decoded.partNo !== '-' ? decoded.partNo : 'Unknown',
          MCType: decoded.mcType !== '-' ? decoded.mcType : null,
          MCNo: decoded.mcNo !== '-' ? decoded.mcNo : null,
          PlanDate: decoded.planDate !== '-' ? decoded.planDate : null,
          barcode: code
        };
        this.screenBarcode = code;
        this.isScreenLocked = true;
        this.returnStep = 2;
        this.showReturnModal = true;
        this.cdr.detectChanges();
        this.focusReturnInput();
      }
    }
  }

  onPaperBarcodeInput(event?: any): void {
    if (this.returnCompletedSuccess) return;
    this.updateDebugState();
    if (!this.paperBarcode) {
      this.extractedPaperRev = null;
      this.verificationStatus = 'idle';
      this.mismatchMsg = '';
      return;
    }

    // Cancel any previous pending debounce timer
    if (this.paperAutoDebounceTimer) {
      clearTimeout(this.paperAutoDebounceTimer);
      this.paperAutoDebounceTimer = null;
    }

    // Live revision preview (sanitize & extract /(.+)-R([A-Z0-9]+)$/)
    const paper = sanitizeScan(this.paperBarcode);
    const m = paper.match(/^(.+)-R([A-Z0-9]+)$/i);
    this.extractedPaperRev = m ? m[2].toUpperCase() : null;
    this.cdr.markForCheck();

    // trigger: idle 600ms = สแกนเสร็จ → เรียก submitPaper()
    this.paperAutoDebounceTimer = setTimeout(() => {
      this.paperAutoDebounceTimer = null;
      if (this.isScreenLocked && this.paperBarcode && !this.isProcessing && !this.returnCompletedSuccess) {
        console.debug('[PAPER INPUT] 600ms debounce elapsed → submitPaper()', this.paperBarcode);
        this.submitPaper();
      }
    }, 600);
  }

  simulatePaperScan(): void {
    if (!this.selectedItemForReturn || this.returnCompletedSuccess) return;
    const paperCode = this.formatPaperBarcodeForItem(this.selectedItemForReturn);
    this.paperBarcode = paperCode;
    const m = paperCode.match(/^(.+)-R([A-Z0-9]+)$/i);
    this.extractedPaperRev = m ? m[2].toUpperCase() : null;
    this.cdr.markForCheck();
    this.submitPaper();
  }

  onPaperBarcodeEnter(): void {
    if (this.returnCompletedSuccess) return;
    // trigger: Enter (สแกนเนอร์ส่งมาอยู่แล้ว) → submitPaper() ทันที
    if (this.paperAutoDebounceTimer) {
      clearTimeout(this.paperAutoDebounceTimer);
      this.paperAutoDebounceTimer = null;
    }
    this.submitPaper();
  }

  submitPaper(): void {
    // 1. กันซ้ำด้วย isProcessing / isSaving / returnCompletedSuccess
    if (this.isProcessing || this.isSaving || this.returnCompletedSuccess) {
      console.debug('[SUBMIT PAPER] Skipped — already processing or completed');
      return;
    }

    if (this.paperAutoDebounceTimer) {
      clearTimeout(this.paperAutoDebounceTimer);
      this.paperAutoDebounceTimer = null;
    }

    const raw = (this.paperBarcode || '').trim();
    if (!raw) return;

    // 2. paper = sanitizeScan(paperBarcode) // แปลงไทย→อังกฤษ ตัดช่องว่าง
    const cleaned = sanitizeScan(raw);
    this.paperBarcode = cleaned;
    this.updateDebugState();

    // 3. ถ้าเป็น ##CLEAR## → resetAll()
    if (isClearCommand(cleaned) || isClearCommand(raw)) {
      this.resetAll();
      return;
    }

    // 4. เข้าสู่ verifyAndProcessReturn ด้วยค่าที่ sanitize แล้ว
    this.verifyAndProcessReturn(cleaned);
  }

  // Step 2: Handle scan off physical paper document & direct comparison (Job Key + Revision)
  verifyAndProcessReturn(directPaperCode?: string): void {
    if (this.isProcessing || this.isSaving || this.returnCompletedSuccess) {
      console.debug('[VERIFY] Skipped — already processing or completed');
      return;
    }

    if (this.paperAutoDebounceTimer) {
      clearTimeout(this.paperAutoDebounceTimer);
      this.paperAutoDebounceTimer = null;
    }

    if (!this.isScreenLocked) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'กรุณาสแกนบาร์โค้ดบนหน้าจอเพื่อล็อคข้อมูล (Step 1) ก่อนครับ',
        showConfirmButton: false,
        focusConfirm: false,
        returnFocus: false,
        timer: 2000
      });
      return;
    }

    const rawScanned = (directPaperCode !== undefined ? directPaperCode : this.paperBarcode) || '';
    // paper = sanitizeScan(paperBarcode) // แปลงไทย→อังกฤษ ตัดช่องว่าง
    const paper = sanitizeScan(rawScanned);
    this.paperBarcode = paper;
    this.updateDebugState();
    this.cdr.markForCheck();

    if (!paper) {
      return;
    }

    // แยก: /^(.+)-R([A-Z0-9]+)$/ → base, rev (ไม่มี -R ก็ใช้ทั้งก้อนเป็น base, rev = null)
    const splitMatch = paper.match(/^(.+)-R([A-Z0-9]+)$/i);
    const base = splitMatch ? splitMatch[1].trim() : paper;
    const rev = splitMatch ? splitMatch[2].trim().toUpperCase() : null;
    this.extractedPaperRev = rev;

    const screenBase = sanitizeScan(this.screenBarcode || '');

    // match ถ้า base === sanitizeScan(screenBarcode)
    const isBaseMatch = (base.toUpperCase() === screenBase.toUpperCase());

    // และ rev === Expected Rev บนจอ (เช่น "NR" หรือ "0")
    const systemRev = (
      this.selectedItemForReturn?.pathDwgRev ||
      this.selectedItemForReturn?.PathDwgRev ||
      this.selectedItemForReturn?.Revision ||
      ''
    ).toString().trim();

    let isRevMatch = true;
    if (systemRev && systemRev !== '-') {
      const cleanSys = systemRev.toUpperCase().replace(/^R(EV)?/i, '').trim();
      const cleanPaper = (rev || '').toUpperCase().replace(/^R(EV)?/i, '').trim();

      const isInitialSys = cleanSys === '0' || cleanSys === 'NR' || cleanSys === '';
      const isInitialPaper = cleanPaper === '0' || cleanPaper === 'NR' || cleanPaper === '';

      if (cleanSys === cleanPaper || (isInitialSys && isInitialPaper)) {
        isRevMatch = true;
      } else {
        isRevMatch = false;
      }
    }

    if (!isBaseMatch || !isRevMatch) {
      this.verificationStatus = 'mismatched';
      if (!isBaseMatch) {
        this.mismatchMsg = `รหัสงานไม่ตรงกัน! กระดาษ (${base}) ไม่ตรงกับหน้าจอ (${screenBase})`;
      } else {
        this.mismatchMsg = `ฉบับแบบไม่ตรงกัน! กระดาษเป็น Rev ${rev || '-'} แต่ระบบต้องการ Rev ${systemRev || '-'}`;
      }
      this.cdr.detectChanges();

      // ไม่ตรง → แสดง mismatch ในหน้า (ไม่ใช้ Swal ที่มีปุ่ม)
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: !isBaseMatch ? 'รหัสงานไม่ตรงกัน! (Job Mismatch)' : 'Revision ไม่ตรงกัน! (Rev Mismatch)',
        text: this.mismatchMsg,
        showConfirmButton: false,
        focusConfirm: false,
        returnFocus: false,
        timer: 3500,
        didClose: () => {
          if (this.showReturnModal && this.isScreenLocked) this.focusReturnInput();
        }
      });
      this.focusReturnInput();
      return;
    }

    // ตรง → verifyAndProcessReturn ส่ง planIds ของแถวที่เปิดอยู่
    this.verificationStatus = 'matched';
    this.mismatchMsg = '';
    this.cdr.markForCheck();

    this.processReturnByBarcode(base || paper);
  }

  // Barcode Decoder: Support Format 1 (Pipe-separated) & Format 2 (Short Code 14 chars)
  decodeBarcode(rawCode: string): {
    rawBarcode: string;
    truncatedDisplay: string;
    partNo: string;
    mcType: string;
    mcNo: string;
    planDate: string;
    revision?: string;
    comment?: string;
    format: 'short_code' | 'pipe_separated' | 'other';
    matchedItem?: any;
  } {
    const raw = this.cleanBarcodeString(rawCode).trim();
    const upper = raw.toUpperCase();

    let format: 'short_code' | 'pipe_separated' | 'other' = 'other';
    let truncatedDisplay = raw;
    let partNo = '';
    let mcType = '';
    let mcNo = '';
    let planDate = '';
    let dayNum: number | null = null;

    // 1. Format 2: Generic Short Code 14 chars (e.g. "ENG25BW1278P01", "ENH30BW1278P01")
    // Strictly verified with SHORT_CODE_RE = /^[A-Z]{3}[0-9]{2}[A-Z0-9]{9}$/ (NO hardcoded 'ENG')
    if (SHORT_CODE_RE.test(upper)) {
      format = 'short_code';
      try {
        const sc = decodeShortCode(upper);
        mcType = sc.mcType; // slice(5, 9) e.g. 'BW12'
        mcNo = sc.mcNo;     // slice(9, 11) e.g. '78'
        planDate = sc.planDate; // e.g. '2026-09-25'
        dayNum = sc.day;
        const pCode = sc.partCode;
        truncatedDisplay = `${upper.substring(0, 5)} | ${mcType}-${mcNo} | ${pCode}`;
      } catch (err: any) {
        console.warn('[DECODE BARCODE] Short Code decode error:', err.message);
      }
    } 
    // 2. Format 1: Pipe-separated (e.g., "260925|260925|BW12|78")
    else if (raw.includes('|')) {
      format = 'pipe_separated';
      const parts = raw.split('|').map(s => s.trim());
      if (parts.length >= 4) {
        const pRec = parts[0];
        const pPlan = parts[1];
        mcType = parts[2];
        mcNo = parts[3];
        planDate = this.normalizeDateStrToIso(pPlan) || this.normalizeDateStrToIso(pRec);
        truncatedDisplay = `${pPlan || pRec} | ${mcType}-${mcNo}`;
      }
    }

    // Match against local documentList
    let matchedItem: any = null;
    if (format === 'short_code' && mcType && mcNo) {
      matchedItem = this.documentList.find(d => {
        const itemMC = (d.MCType || d.MC_Type || '').trim().toUpperCase();
        const itemNo = (d.MCNo || d.MC_No || '').replace(/\s+/g, '');
        const mcMatch = itemMC === mcType.toUpperCase() && (itemNo === mcNo || itemNo.includes(mcNo) || mcNo.includes(itemNo));
        if (!mcMatch) return false;

        if (dayNum) {
          const itemDate = d.PlanDate || d.planDate || d.Date;
          if (itemDate) {
            const dt = new Date(itemDate);
            if (!isNaN(dt.getTime()) && dt.getDate() === dayNum) return true;
          }
        }
        return true;
      });
    } else {
      matchedItem = this.findItemByBarcode(raw);
    }

    if (matchedItem) {
      partNo = matchedItem.PartNo || partNo;
      mcType = matchedItem.MCType || matchedItem.MC_Type || mcType;
      mcNo = matchedItem.formattedMcNo || matchedItem.MCNo || matchedItem.MC_No || mcNo;
      planDate = this.toIsoDateStr(matchedItem.PlanDate || matchedItem.planDate || matchedItem.Date) || planDate;
      if (format === 'other' && /^[A-Z]{3}\d{2}/.test(upper)) {
        format = 'short_code';
        truncatedDisplay = `${upper.substring(0, 5)} | ${mcType}-${mcNo}`;
      }
    }

    // Fallback date construction if still empty for short code with dayNum
    if (!planDate && dayNum) {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      planDate = `${yr}-${mo}-${d}`;
    }

    return {
      rawBarcode: raw,
      truncatedDisplay,
      partNo: partNo || (format === 'short_code' ? 'A5D46-2-G1C' : '-'),
      mcType: mcType || '-',
      mcNo: mcNo || '-',
      planDate: planDate || '-',
      revision: matchedItem?.pathDwgRev || matchedItem?.Revision || '-',
      comment: matchedItem?.Comment || '',
      format,
      matchedItem
    };
  }

  // Match check logic between screen barcode and paper barcode (with semantic short code support)
  checkBarcodeMatch(screen: string, paper: string): boolean {
    if (!screen || !paper) return false;
    const s = screen.trim().toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
    const p = paper.trim().toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
    if (s === p) return true;

    // Compatibility tolerance for ENG vs ECF scanner keyboard quirk
    if ((s.startsWith('ecf') && p.startsWith('eng') && s.substring(3) === p.substring(3)) ||
        (s.startsWith('eng') && p.startsWith('ecf') && s.substring(3) === p.substring(3))) {
      return true;
    }

    // Decode both barcodes to compare semantically (supports Short Code <-> Pipe Code cross matching)
    const decS = this.decodeBarcode(screen);
    const decP = this.decodeBarcode(paper);

    if (decS.mcType && decP.mcType && decS.mcNo && decP.mcNo && decS.mcType !== '-' && decP.mcType !== '-') {
      const typeMatch = decS.mcType.toUpperCase() === decP.mcType.toUpperCase();
      const sNo = decS.mcNo.replace(/\s+/g, '');
      const pNo = decP.mcNo.replace(/\s+/g, '');
      const noMatch = sNo === pNo || sNo.includes(pNo) || pNo.includes(sNo);
      if (typeMatch && noMatch) {
        return true;
      }
    }

    if (decP.partNo && decP.partNo !== '-' && this.selectedItemForReturn?.PartNo) {
      if (decP.partNo.trim().toLowerCase() === this.selectedItemForReturn.PartNo.trim().toLowerCase()) {
        return true;
      }
    }

    // Component comparison fallback
    if (screen.includes('|') && paper.includes('|')) {
      const sParts = screen.split('|').map(x => x.trim().toLowerCase().replace(/\s+/g, '').replace(/-/g, ''));
      const pParts = paper.split('|').map(x => x.trim().toLowerCase().replace(/\s+/g, '').replace(/-/g, ''));
      if (sParts.length >= 4 && pParts.length >= 4) {
        const sMCType = sParts[2];
        const sMCNo = sParts[3];
        const pMCType = pParts[2];
        const pMCNo = pParts[3];

        const mcTypeMatch = sMCType === pMCType;
        const mcNoMatch = sMCNo === pMCNo || sMCNo.includes(pMCNo) || pMCNo.includes(sMCNo);

        const sD0 = this.normalizeDateStrToIso(sParts[0]);
        const sD1 = this.normalizeDateStrToIso(sParts[1]);
        const pD0 = this.normalizeDateStrToIso(pParts[0]);
        const pD1 = this.normalizeDateStrToIso(pParts[1]);

        const dateMatch = sParts[0] === pParts[0] || sParts[1] === pParts[1] || sParts[0] === pParts[1] || sParts[1] === pParts[0]
          || (sD0 && (sD0 === pD0 || sD0 === pD1))
          || (sD1 && (sD1 === pD0 || sD1 === pD1));

        if (mcTypeMatch && mcNoMatch && dateMatch) {
          return true;
        }
      }
    }

    if (this.selectedItemForReturn?.PartNo) {
      const partNo = this.selectedItemForReturn.PartNo.trim().toLowerCase();
      if (p === partNo) return true;
    }

    return false;
  }

  findItemByBarcode(code: string): any {
    if (!code) return null;
    const cleanCode = code.trim().toLowerCase().replace(/-/g, '');

    // 1. Direct barcode or PartNo match
    let found = this.documentList.find(d => {
      const itemBarcode = (d.barcode || '').trim().toLowerCase().replace(/-/g, '');
      const itemPartNo = (d.PartNo || '').trim().toLowerCase();
      return itemBarcode === cleanCode || itemPartNo === cleanCode;
    });
    if (found) return found;

    // 2. Short Code (14 chars) e.g. ENG25BW1278P01, ENH30BW1278P01
    // Strictly verified with SHORT_CODE_RE = /^[A-Z]{3}[0-9]{2}[A-Z0-9]{9}$/ (NO hardcoded 'ENG')
    const upper = code.trim().toUpperCase();
    if (SHORT_CODE_RE.test(upper)) {
      try {
        const sc = decodeShortCode(upper);
        const scMCType = sc.mcType;
        const scMCNo = sc.mcNo;
        const scDay = sc.day;
        const scPlanDate = sc.planDate;

        found = this.documentList.find(d => {
          const itemMC = (d.MCType || d.MC_Type || '').trim().toUpperCase();
          const itemNo = (d.MCNo || d.MC_No || '').replace(/\s+/g, '');
          const mcMatch = itemMC === scMCType.toUpperCase() && itemNo === scMCNo;
          if (mcMatch) {
            const itemDate = d.PlanDate || d.planDate || d.Date;
            if (itemDate) {
              const dt = new Date(itemDate);
              if (!isNaN(dt.getTime())) {
                const itemIso = this.toIsoDateStr(itemDate);
                if (itemIso === scPlanDate) return true;
              }
            }
          }
          return false;
        });
        if (found) return found;
      } catch (e) {}
    }

    // 3. 4-part barcode
    if (code.includes('|')) {
      const parts = code.split('|').map(s => s.trim().replace(/-/g, ''));
      if (parts.length >= 4) {
        const pRec = parts[0];
        const pPlan = parts[1];
        const pMC = parts[2].toLowerCase();
        const pNo = parts[3].replace(/\s+/g, '');

        found = this.documentList.find(d => {
          const itemMC = (d.MCType || d.MC_Type || '').trim().toLowerCase();
          const itemNo = (d.MCNo || d.MC_No || '').replace(/\s+/g, '');
          const mcMatch = itemMC === pMC && (itemNo === pNo || itemNo.includes(pNo) || pNo.includes(itemNo));
          if (mcMatch) {
            const itemPlanDate = this.toIsoDateStr(d.PlanDate || d.planDate || d.Date);
            const itemRecDate = this.toIsoDateStr(d.DateTime_Record || d.DateTimeRecordStr || d.ScanTime || d.CreatedAt);
            const normPPlan = this.normalizeDateStrToIso(pPlan);
            const normPRec = this.normalizeDateStrToIso(pRec);

            if (normPPlan && itemPlanDate !== 'NODATE' && itemPlanDate === normPPlan) return true;
            if (normPRec && itemRecDate !== 'NODATE' && itemRecDate === normPRec) return true;
            return true;
          }
          return false;
        });
      }
    }
    return found || null;
  }

  getBarcodeImageUrl(barcodeStr?: string): string {
    const text = barcodeStr || this.screenBarcode || this.selectedItemForReturn?.barcode;
    if (!text || !text.trim()) return '';
    const scale = this.isBarcodeZoomed ? 4 : 3;
    const height = this.isBarcodeZoomed ? 52 : 48;
    return `${this.apiUrl}/engineer-return/barcode-image?text=${encodeURIComponent(text.trim())}&scale=${scale}&height=${height}&v=sharp_${scale}_h${height}`;
  }

  toggleBarcodeZoom(): void {
    this.isBarcodeZoomed = !this.isBarcodeZoomed;
    this.cdr.markForCheck();
  }

  // Barcode Zoom Popup Modal (ขยายเต็มจอกลางจอ หนาถี่ชัด สำหรับสแกนเนอร์)
  openBarcodeZoom(): void {
    if (!this.screenBarcode && this.selectedItemForReturn) {
      this.screenBarcode = this.selectedItemForReturn.barcode || this.formatBarcodeForItem(this.selectedItemForReturn);
    }
    this.showBarcodeZoomModal = true;
    this.cdr.markForCheck();
  }

  closeBarcodeZoom(): void {
    this.showBarcodeZoomModal = false;
    this.cdr.markForCheck();
    if (this.showReturnModal && this.isScreenLocked && !this.returnCompletedSuccess) {
      this.focusReturnInput();
    }
  }

  getZoomBarcodeImageUrl(barcodeStr?: string): string {
    const text = barcodeStr || this.screenBarcode || this.selectedItemForReturn?.barcode;
    if (!text || !text.trim()) return '';
    return `${this.apiUrl}/engineer-return/barcode-image?text=${encodeURIComponent(text.trim())}&scale=4&height=52&v=zoom_sharp_v4`;
  }

  onBarcodeImgError(event: any): void {
    this.barcodeLoadError = true;
  }

  copyBarcode(): void {
    const text = this.screenBarcode || this.selectedItemForReturn?.barcode || this.scannedBarcode;
    if (!text) return;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.isCopied = true;
        this.cdr.markForCheck();
        setTimeout(() => { this.isCopied = false; this.cdr.markForCheck(); }, 2000);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'คัดลอกบาร์โค้ดสำเร็จ',
          showConfirmButton: false,
          focusConfirm: false,
          returnFocus: false,
          timer: 1500,
          didClose: () => {
            if (this.showReturnModal && this.isScreenLocked && !this.returnCompletedSuccess) {
              this.focusReturnInput();
            }
          }
        });
        if (this.showReturnModal && this.isScreenLocked && !this.returnCompletedSuccess) {
          this.focusReturnInput();
        }
      }).catch(() => {});
    }
  }

  triggerSideReturnComplete(data: any): void {
    this.lastReturnedInfo = {
      partNo: data.partNo || this.selectedItemForReturn?.PartNo || 'Unknown Part',
      targetDocType: data.targetDocType || 'DWG',
      pathDwgRev: data.pathDwgRev || this.selectedItemForReturn?.pathDwgRev || '-',
      pathLayoutRev: data.pathLayoutRev || this.selectedItemForReturn?.pathLayoutRev || '-',
      docRevision: data.pathDwgRev || data.docRevision || this.selectedItemForReturn?.pathDwgRev || '',
      mcType: data.mcType || this.selectedItemForReturn?.MCType || '',
      mcNo: data.mcNo || this.selectedItemForReturn?.formattedMcNo || this.selectedItemForReturn?.MCNo || '',
      planSetupDate: this.formatPlanDate(data.planDate || this.selectedItemForReturn?.PlanDate || this.selectedItemForReturn?.planDate || this.selectedItemForReturn?.planSetupDate),
      comment: data.comment || data.setup || this.selectedItemForReturn?.Comment || '',
      setup: data.comment || data.setup || this.selectedItemForReturn?.Comment || '',
      barcode: data.barcode || this.screenBarcode || this.scannedBarcode,
      scannedBy: data.scannedBy || this.currentUser,
      time: new Date()
    };
    this.showSideToast = true;
    this.cdr.markForCheck();

    if (this.sideToastTimer) {
      clearTimeout(this.sideToastTimer);
    }
    this.sideToastTimer = setTimeout(() => {
      this.showSideToast = false;
      this.cdr.markForCheck();
    }, 7000);
  }

  closeSideToast(): void {
    this.showSideToast = false;
    if (this.sideToastTimer) {
      clearTimeout(this.sideToastTimer);
    }
    this.cdr.markForCheck();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    if (this.showReturnModal && this.isScreenLocked) {
      setTimeout(() => this.focusReturnInput(), 50);
    }
    this.updateDebugState();
  }

  @HostListener('document:keydown', ['$event'])
  handleGlobalKeyboard(event: KeyboardEvent): void {
    // 1. Record for scan debug monitor
    this.recordDebugKey(event);

    const isEnter = event.key === 'Enter' || event.key === 'Tab' || event.keyCode === 13 || event.keyCode === 9;
    const target = event.target as HTMLElement | null;
    const isTargetPaperInput = target === this.paperBarcodeInputRef?.nativeElement || target?.id === 'paperBarcodeInput';

    if (event.key === 'Escape') {
      if (this.showBarcodeZoomModal) {
        this.closeBarcodeZoom();
        event.preventDefault();
        return;
      }
    }

    if (this.returnCompletedSuccess) {
      if (event.key === 'Escape' || isEnter) {
        event.preventDefault();
        this.closeReturnModal();
      }
      return;
    }

    // ── FALLBACK FOR STEP 2 (Requirement 1 & 2) ──────────────────────────────
    if (this.showReturnModal && this.isScreenLocked) {
      if (isEnter) {
        event.preventDefault();
        this.onPaperBarcodeEnter();
        return;
      }

      // If focus is directly in paperBarcodeInput, browser will handle inserting character.
      // Do NOT duplicate character!
      if (isTargetPaperInput) {
        return;
      }

      // Check if focus is in another editable element (e.g. search box, remarks input)
      const tagName = target?.tagName?.toUpperCase();
      const isOtherInput = (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') && !isTargetPaperInput;
      if (isOtherInput) {
        return;
      }

      // If focus is NOT in another input (e.g. activeElement is BODY, BUTTON, DIV)
      // capture printable character (including Thai) and append to paperBarcode!
      if (event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        this.paperBarcode = (this.paperBarcode || '') + event.key;
        this.onPaperBarcodeInput();
        this.focusReturnInput();
        event.preventDefault();
        return;
      }

      // Never let Step 2 keys bleed into Step 1 buffer!
      return;
    }

    // ── GLOBAL SCANNER BUFFER FOR STEP 1 (When isScreenLocked = false or main table) ──
    if (isEnter) {
      if (this.barcodeBuffer && this.barcodeBuffer.length >= 4) {
        const scanned = sanitizeScan(this.barcodeBuffer);
        this.barcodeBuffer = '';
        if (this.paperAutoDebounceTimer) {
          clearTimeout(this.paperAutoDebounceTimer);
          this.paperAutoDebounceTimer = null;
        }
        this.handleScannerInput(scanned);
        event.preventDefault();
      }
    } else if (event.key && event.key.length === 1 && !event.ctrlKey && (!event.altKey || /^\d$/.test(event.key))) {
      const now = Date.now();
      if (now - this.lastScanTimestamp > 1500) {
        this.barcodeBuffer = '';
      }
      this.lastScanTimestamp = now;
      this.barcodeBuffer += event.key;

      if (this.barcodeBuffer.length > 60) {
        this.barcodeBuffer = this.barcodeBuffer.slice(-30);
      }
    }
  }

  handleScannerInput(rawCode: string): void {
    // Step 1 scanner listener MUST return immediately if isScreenLocked is true
    if (this.isScreenLocked) {
      console.debug('[SCANNER INPUT] Ignored in Step 1 handler because isScreenLocked is true');
      return;
    }

    const scanned = sanitizeScan(rawCode);
    if (!scanned) return;

    // ── CLEAR Command Barcode (path 1 of 2: from global keyboard buffer) ────────
    // Uses isClearCommand() which checks endsWith('##CLEAR##') after sanitizeScan.
    // This handles Thai-keyboard ##CLEAR## too since sanitizeScan transliterates first.
    // We do NOT handle bare 'CLEAR' here — see barcodeCodec.ts isClearCommand() for why.
    if (isClearCommand(scanned)) {
      this.resetAll();
      return;
    }
    // ────────────────────────────────────────────────────────────────────────────

    if (!this.showReturnModal) {
      // กรณียิงสแกนจากหน้าจอหลัก (ตาราง Plan / Return)
      // เปิด Return Modal และล็อคข้อมูลหน้าจอ Step 1 ทันที เพื่อรอสแกนใบกระดาษ Step 2 (ยังไม่บันทึก DB!)
      this.onScreenBarcodeScanned(scanned);
    } else {
      // หน้าต่าง Return Modal เปิดอยู่
      if (!this.isScreenLocked) {
        // Step 1: สแกนบาร์โค้ดหน้าจอเพื่อล็อคและจำค่านั้นไว้ (ยังไม่บันทึก DB จนกว่าจะผ่าน Step 2!)
        const isMatch = !this.screenBarcode || this.checkBarcodeMatch(this.screenBarcode, scanned);
        if (isMatch) {
          if (!this.screenBarcode) {
            this.screenBarcode = scanned;
          }
          this.isScreenLocked = true;
          this.returnStep = 2;
          this.paperBarcode = '';
          this.verificationStatus = 'idle';
          this.mismatchMsg = '';
          this.decodedBarcodeInfo = this.decodeBarcode(this.screenBarcode);
          this.closeBarcodeZoom();
          this.cdr.detectChanges();

          this.startStep2FocusLock();

          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'ล็อคข้อมูลหน้าจอสำเร็จ! (จำค่าไว้แล้ว)',
            text: 'ไปสเต็ป 2: กรุณาสแกนบาร์โค้ดจากใบกระดาษ Drawing ยืนยันการคืน',
            showConfirmButton: false,
            focusConfirm: false,
            returnFocus: false,
            timer: 2000,
            timerProgressBar: true,
            didClose: () => {
              if (this.showReturnModal && this.isScreenLocked) this.focusReturnInput();
            }
          });

          this.focusReturnInput();
        } else {
          // กรณีสแกนบาร์โค้ดของงานอื่นในระบบ -> ทำการสลับมาที่งานนี้แล้วล็อคทันที
          const foundItem = this.findItemByBarcode(scanned);
          if (foundItem) {
            this.selectedItemForReturn = foundItem;
            this.screenBarcode = foundItem.barcode || this.formatBarcodeForItem(foundItem) || scanned;
            this.isScreenLocked = true;
            this.returnStep = 2;
            this.paperBarcode = '';
            this.verificationStatus = 'idle';
            this.mismatchMsg = '';
            this.decodedBarcodeInfo = this.decodeBarcode(this.screenBarcode);
            this.closeBarcodeZoom();
            this.cdr.detectChanges();

            this.startStep2FocusLock();

            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: 'สลับรายการและล็อคข้อมูลหน้าจอสำเร็จ!',
              text: 'ไปสเต็ป 2: กรุณาสแกนบาร์โค้ดจากใบกระดาษ Drawing ยืนยันการคืน',
              showConfirmButton: false,
              focusConfirm: false,
              returnFocus: false,
              timer: 2000,
              timerProgressBar: true,
              didClose: () => {
                if (this.showReturnModal && this.isScreenLocked) this.focusReturnInput();
              }
            });

            this.focusReturnInput();
          } else {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'warning',
              title: 'บาร์โค้ดไม่ตรงกับหน้าจอ',
              text: `ค่าที่สแกนได้: ${scanned}`,
              showConfirmButton: false,
              focusConfirm: false,
              returnFocus: false,
              timer: 3000
            });
          }
        }
      }
    }
  }

  // =========================================================================
  // Data Splitting & Processing Architecture (Angular UI + Node.js/MSSQL)
  // =========================================================================
  processBarcodeWithSplitting(directBarcode?: string): void {
    const raw = sanitizeScan(directBarcode || this.paperBarcode || this.screenBarcode || '').trim();
    if (!raw) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'กรุณาสแกนหรือกรอก บาร์โค้ด',
        showConfirmButton: false,
        focusConfirm: false,
        returnFocus: false,
        timer: 2000
      });
      return;
    }

    // Decode Barcode (Supports Format 1: Pipe-separated & Format 2: Short Code)
    const decoded = this.decodeBarcode(raw);
    this.decodedBarcodeInfo = decoded;

    // ─────────────────────────────────────────────────────────────────
    // ขาที่ 1: Frontend UI (Angular Component)
    // ─────────────────────────────────────────────────────────────────
    let targetItem = this.selectedItemForReturn || decoded.matchedItem;
    if (!targetItem) {
      targetItem = {
        PartNo: decoded.partNo !== '-' ? decoded.partNo : 'Unknown',
        MCType: decoded.mcType !== '-' ? decoded.mcType : null,
        MCNo: decoded.mcNo !== '-' ? decoded.mcNo : null,
        PlanDate: decoded.planDate !== '-' ? decoded.planDate : null,
        barcode: raw,
        pathDwgRev: decoded.revision !== '-' ? decoded.revision : '-',
        Comment: decoded.comment || ''
      };
    } else {
      if ((!targetItem.PartNo || targetItem.PartNo === 'Unknown') && decoded.partNo !== '-') {
        targetItem.PartNo = decoded.partNo;
      }
      if (!targetItem.MCType && decoded.mcType !== '-') targetItem.MCType = decoded.mcType;
      if (!targetItem.MCNo && decoded.mcNo !== '-') targetItem.MCNo = decoded.mcNo;
      if (!targetItem.PlanDate && decoded.planDate !== '-') targetItem.PlanDate = decoded.planDate;
    }

    this.selectedItemForReturn = targetItem;
    this.isSaving = true;
    this.isProcessing = true;
    this.cdr.markForCheck();

    // ─────────────────────────────────────────────────────────────────
    // ขาที่ 2: Backend API & Database (Node.js/Express + MSSQL)
    // ─────────────────────────────────────────────────────────────────
    const planIds = targetItem?.planIds 
      || targetItem?.items?.map((i: any) => i.Plan_ID).filter(Boolean) 
      || (targetItem?.Plan_ID ? [targetItem.Plan_ID] : []);

    const payload = {
      rawBarcode: raw,
      barcode: raw,
      partNo: targetItem?.PartNo,
      mcType: targetItem?.MCType || targetItem?.MC_Type,
      mcNo: targetItem?.MCNo || targetItem?.MC_No,
      planDate: targetItem?.PlanDate || targetItem?.planDate,
      scannedBy: this.currentUser,
      targetDocType: 'DWG',
      pathDwgRev: targetItem?.pathDwgRev || targetItem?.PathDwgRev,
      pathLayoutRev: targetItem?.pathLayoutRev || targetItem?.PathLayoutRev,
      revision: targetItem?.pathDwgRev || targetItem?.PathDwgRev || targetItem?.Revision,
      docRevision: targetItem?.pathDwgRev || targetItem?.PathDwgRev,
      planIds: planIds,
      comment: targetItem?.Comment,
      status: 'Completed',
      actionType: 'Return',
      remarks: `Step 2 Verified Return: ${raw}`
    };

    this.http.post<any>(`${this.apiUrl}/engineer-return/process-return`, payload).subscribe({
      next: (res) => {
        this.isSaving = false;
        this.isProcessing = false;
        const resData = res.data || {};
        const partNoUpdated = resData.partNo || payload.partNo;
        const dwgRevUpdated = resData.pathDwgRev || payload.pathDwgRev;
        const layoutRevUpdated = resData.pathLayoutRev || payload.pathLayoutRev;
        const mcTypeUpdated = resData.mcType || payload.mcType;
        const mcNoUpdated = resData.mcNo || payload.mcNo;
        const commentUpdated = resData.comment || targetItem?.Comment;

        // Immediate UI feedback on matching items
        this.documentList.forEach(item => {
          let match = false;
          if (targetItem && item === targetItem) {
            match = true;
          } else if (item.barcode === raw) {
            match = true;
          } else if (planIds.includes(item.Plan_ID) || (item.items && item.items.some((sub: any) => planIds.includes(sub.Plan_ID)))) {
            match = true;
          }

          if (match) {
            item.returnBalance = 'Complete';
            item.Status = 'Issue Completed';
            item.ScannedBy = this.currentUser;
            item.ReturnBy = this.currentUser;
            item.scannedBy = this.currentUser;
            item.returnedDocCount = item.planDocCount || 1;
            item.isReturnComplete = true;
            item.justReturned = true;
            setTimeout(() => { item.justReturned = false; this.cdr.markForCheck(); }, 6000);
          }
        });

        this.calculateStats();

        // 1. Set return complete success state in modal & UI
        this.stopStep2FocusLock();
        this.returnCompletedSuccess = true;
        this.autoCloseCountdown = 3;
        this.verificationStatus = 'matched';
        this.mismatchMsg = '';

        if (this.selectedItemForReturn) {
          this.selectedItemForReturn.returnBalance = 'Complete';
          this.selectedItemForReturn.Status = 'Issue Completed';
          this.selectedItemForReturn.returnedDocCount = this.selectedItemForReturn.planDocCount || 1;
          this.selectedItemForReturn.isReturnComplete = true;
          this.selectedItemForReturn.ReturnBy = this.currentUser;
          this.selectedItemForReturn.ScannedBy = this.currentUser;
        }

        // 2. Persistent side toast banner ("ข้างๆจอให้เห็น")
        this.triggerSideReturnComplete({
          partNo: partNoUpdated,
          targetDocType: 'DWG',
          pathDwgRev: dwgRevUpdated,
          pathLayoutRev: layoutRevUpdated,
          mcType: mcTypeUpdated,
          mcNo: mcNoUpdated,
          setup: commentUpdated,
          barcode: raw,
          scannedBy: this.currentUser
        });

        // 3. SweetAlert toast (Non-blocking, no confirm buttons, no focus stealing)
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `บันทึกการส่งคืนสำเร็จ! (Return Complete)`,
          html: `<div style="text-align: left; font-size: 0.82rem; line-height: 1.5;">
            <div><strong>Barcode:</strong> <span class="badge bg-primary text-white font-monospace">${raw}</span></div>
            <div><strong>Part No:</strong> ${partNoUpdated || '-'}</div>
            <div><strong>MC:</strong> ${mcTypeUpdated || '-'} #${mcNoUpdated || '-'}</div>
            <div class="text-success small mt-1"><i class="bi bi-database-check me-1"></i>บันทึกลง [Engineer_Return] สำเร็จ</div>
          </div>`,
          showConfirmButton: false,
          focusConfirm: false,
          returnFocus: false,
          timer: 3000,
          timerProgressBar: true
        });

        // 4. Keep modal showing completed data for 3 seconds, then close smoothly without reloading table
        if (this.autoCloseInterval) {
          clearInterval(this.autoCloseInterval);
        }
        if (this.autoCloseTimer) {
          clearTimeout(this.autoCloseTimer);
        }

        this.autoCloseInterval = setInterval(() => {
          if (this.autoCloseCountdown > 1) {
            this.autoCloseCountdown--;
            this.cdr.markForCheck();
          } else {
            clearInterval(this.autoCloseInterval);
            this.autoCloseInterval = null;
          }
        }, 1000);

        this.autoCloseTimer = setTimeout(() => {
          this.closeReturnModal();
        }, 3000);

        // NOTE: We deliberately do NOT call this.loadData() here!
        // Calling loadData() sets isLoading = true which destroys the table DOM and resets the scroll position to the top.
        // The local documentList item is already updated in-place with animation, preserving user scroll!
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSaving = false;
        this.isProcessing = false;
        console.error('Error processing return:', err);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'error',
          title: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล (DB)',
          text: err.error?.error || 'ไม่สามารถทำการบันทึกคืนข้อมูลได้',
          showConfirmButton: false,
          focusConfirm: false,
          returnFocus: false,
          timer: 4000,
          didClose: () => {
            if (this.showReturnModal && this.isScreenLocked) this.focusReturnInput();
          }
        });
        this.focusReturnInput();
      }
    });
  }

  processReturnByBarcode(directBarcode?: string): void {
    this.processBarcodeWithSplitting(directBarcode);
  }

  // --- Print Feature with YES / NO Confirmation ---
  onPrintClick(item: any): void {
    const planSetupDateStr = item.planSetupDate || this.formatPlanDate(item.PlanDate || item.planDate || item.Date || item.date);
    const paperBarcodeStr = this.formatPaperBarcodeForItem(item);
    const dwgRev = item.pathDwgRev || item.PathDwgRev || item.Revision || '-';

    Swal.fire({
      title: 'พิมพ์เอกสาร Drawing (Print Confirmation)',
      html: `
        <div style="text-align: left; font-size: 0.92rem; line-height: 1.6; padding: 14px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="margin-bottom: 6px;"><strong>Part No:</strong> <span style="color: #2563eb; font-weight: 700; font-size: 1rem;">${item.PartNo || '-'}</span> ${dwgRev !== '-' ? `<span style="background: #e0e7ff; color: #3730a3; padding: 1px 7px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; margin-left: 4px;">Rev: ${dwgRev}</span>` : ''}</div>
          <div style="margin-bottom: 6px;"><strong>MC Type:</strong> ${item.MCType || item.MC_Type || '-'} &nbsp;|&nbsp; <strong>MC No:</strong> ${item.formattedMcNo || item.MCNo || '-'}</div>
          <div style="margin-bottom: 6px;"><strong>Plan Setup (วันที่ PC ต้องการ):</strong> <span style="color: #0f172a; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px;">${planSetupDateStr}</span></div>
          ${item.Comment ? `<div style="margin-bottom: 6px; color: #475569; font-size: 0.86rem;"><strong>หมายเหตุ (Comment):</strong> ${item.Comment}</div>` : ''}
          <div style="margin-bottom: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
            <div style="margin-bottom: 4px;"><strong>Barcode ที่จะปั๊มลงหัวกระดาษ Drawing (พร้อม Rev):</strong></div>
            <div style="font-family: monospace; font-weight: 700; color: #7c3aed; background: #f5f3ff; padding: 5px 9px; border-radius: 6px; border: 1px solid #ddd6fe; font-size: 0.86rem; word-break: break-all;">
              <i class="bi bi-upc me-1"></i>${paperBarcodeStr}
            </div>
            <div class="text-muted small mt-1" style="font-size: 0.73rem;">
              * เมื่อพิมพ์แล้วนำไปผลิต เมื่อนำใบกระดาษมาส่งคืน สแกนเนอร์จะอ่านรหัสนี้เพื่อเทียบกับหน้าจอ
            </div>
          </div>
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #334155; font-weight: 500;">
            คุณต้องการเปิดหน้าต่างสั่งพิมพ์เอกสารนี้ใช่หรือไม่?
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: '<i class="bi bi-printer me-1"></i> YES',
      cancelButtonText: '<i class="bi bi-x-lg me-1"></i> NO',
      reverseButtons: true,
      focusConfirm: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.openPrintModal(item);
      }
    });
  }

  openPrintModal(item: any): void {
    this.selectedItemForPrint = item;
    this.previewZoom = 1;
    this.isPrintModalOpen = true;

    // Check available documents, default to Drawing, then Layout, then IIQC
    if (item.PathDwg && item.PathDwg !== '-') {
      this.selectPrintDocType('dwg');
    } else if (item.PathLayout && item.PathLayout !== '-') {
      this.selectPrintDocType('layout');
    } else if (item.PathIIQC && item.PathIIQC !== '-') {
      this.selectPrintDocType('iiqc');
    } else {
      this.printPreviewUrl = null;
      this.printPreviewBlobUrl = null;
      Swal.fire('แจ้งเตือน', 'ไม่พบไฟล์ Drawing หรือ Layout สำหรับรายการนี้', 'warning');
    }
    this.cdr.markForCheck();
  }

  selectPrintDocType(type: 'dwg' | 'layout' | 'iiqc'): void {
    if (!this.selectedItemForPrint) return;
    this.printDocType = type;
    let rawPath = '';
    if (type === 'dwg') rawPath = this.selectedItemForPrint.PathDwg;
    else if (type === 'layout') rawPath = this.selectedItemForPrint.PathLayout;
    else if (type === 'iiqc') rawPath = this.selectedItemForPrint.PathIIQC;

    const path = this.normalizePath(rawPath);

    if (!path || path === '-') {
      this.printPreviewUrl = null;
      if (this.printPreviewBlobUrl) {
        URL.revokeObjectURL(this.printPreviewBlobUrl);
        this.printPreviewBlobUrl = null;
      }
      return;
    }

    this.isPdfLoading = true;
    const barcodeToStamp = type === 'dwg'
      ? this.formatPaperBarcodeForItem(this.selectedItemForPrint)
      : this.formatBarcodeForItem(this.selectedItemForPrint);
    const reqNo = barcodeToStamp || this.selectedItemForPrint.DocID || this.selectedItemForPrint.barcode || this.selectedItemForPrint.PartNo;
    const cleanPath = path.replace(/^["']|["']$/g, '');
    const encodedPath = encodeURIComponent(cleanPath);

    // 1. เรียก /api/print-pdf จาก UNC share (เหมือนฝั่ง EN ที่เซฟไว้ใน \\pbp083 พร้อมปั๊ม Barcode)
    let printPdfUrl = `${this.apiUrl}/print-pdf?filePath=${encodedPath}&fromTab=PlanListEN`;
    if (barcodeToStamp) {
      printPdfUrl += `&barcode=${encodeURIComponent(barcodeToStamp)}`;
    }
    if (reqNo) {
      printPdfUrl += `&requestNo=${encodeURIComponent(reqNo)}`;
    }
    printPdfUrl += `&docType=${type.toUpperCase()}`;

    this.http.get(printPdfUrl, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.isPdfLoading = false;
        if (this.printPreviewBlobUrl) {
          URL.revokeObjectURL(this.printPreviewBlobUrl);
        }
        const blobUrl = URL.createObjectURL(blob);
        this.printPreviewBlobUrl = blobUrl;
        // ใช้ blobUrl พร้อม #toolbar=1&navpanes=0&view=Fit เพื่อแสดงแถบเครื่องมือ Native PDF และพิมพ์เต็มหน้ากระดาษ
        this.printPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl + '#toolbar=1&navpanes=0&view=Fit');
        this.cdr.markForCheck();
      },
      error: () => {
        // Fallback ไป loadPdfFromPath ถ้า /api/print-pdf ไม่พบไฟล์
        this.http.post<any>(`${this.apiUrl}/loadPdfFromPath`, {
          filePath: path,
          requestNo: reqNo
        }).subscribe({
          next: (res) => {
            this.isPdfLoading = false;
            if (res && res.imageData) {
              const base64 = res.imageData.includes(',') ? res.imageData.split(',')[1] : res.imageData;
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const blob = new Blob([bytes], { type: 'application/pdf' });
              if (this.printPreviewBlobUrl) {
                URL.revokeObjectURL(this.printPreviewBlobUrl);
              }
              const blobUrl = URL.createObjectURL(blob);
              this.printPreviewBlobUrl = blobUrl;
              this.printPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl + '#toolbar=1&navpanes=0&view=Fit');
              this.cdr.markForCheck();
            } else {
              this.printPreviewUrl = null;
              this.cdr.markForCheck();
            }
          },
          error: () => {
            this.isPdfLoading = false;
            this.printPreviewUrl = null;
            this.cdr.markForCheck();
          }
        });
      }
    });
  }

  closePrintModal(): void {
    this.isPrintModalOpen = false;
    this.selectedItemForPrint = null;
    if (this.printPreviewBlobUrl) {
      URL.revokeObjectURL(this.printPreviewBlobUrl);
      this.printPreviewBlobUrl = null;
    }
    this.printPreviewUrl = null;
    this.previewZoom = 1;
    this.cdr.markForCheck();
  }

  printPdf(): void {
    if (!this.printPreviewBlobUrl && !this.printPreviewUrl) {
      Swal.fire('ข้อผิดพลาด', 'ไม่พบไฟล์ PDF สำหรับพิมพ์', 'warning');
      return;
    }

    // สั่งพิมพ์แบบเต็มหน้ากระดาษ A4 Landscape (เหมือนฝั่ง EN ที่เซฟไว้ใน PDF 083)
    // ส่ง Stream PDF ผ่าน Dedicated Hidden Iframe โดยตรงไปยัง Driver ของเครื่องพิมพ์
    try {
      const existing = document.getElementById('tempDocPrintIframe');
      if (existing) {
        existing.remove();
      }

      const printIframe = document.createElement('iframe');
      printIframe.id = 'tempDocPrintIframe';
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = '0';
      printIframe.style.visibility = 'hidden';
      printIframe.src = this.printPreviewBlobUrl || '';
      document.body.appendChild(printIframe);

      printIframe.onload = () => {
        const cw = printIframe.contentWindow;
        if (cw) {
          setTimeout(() => {
            cw.focus();
            cw.print();
          }, 150);

          const cleanup = () => {
            setTimeout(() => {
              try {
                document.body.removeChild(printIframe);
              } catch (_) {}
            }, 1500);
          };
          cw.onafterprint = cleanup;
        }
      };
    } catch (e) {
      console.warn('Dedicated print iframe error, opening in new tab:', e);
      this.openInNewTab();
    }
  }

  private fallbackPrint(): void {
    if (this.printPreviewBlobUrl) {
      const printWin = window.open(this.printPreviewBlobUrl, '_blank');
      if (printWin) {
        printWin.focus();
      }
    }
  }

  openInNewTab(): void {
    if (this.printPreviewBlobUrl) {
      window.open(this.printPreviewBlobUrl, '_blank');
    }
  }

  zoomIn(): void {
    this.previewZoom = Math.min(2.5, Number((this.previewZoom + 0.25).toFixed(2)));
  }

  zoomOut(): void {
    this.previewZoom = Math.max(0.5, Number((this.previewZoom - 0.25).toFixed(2)));
  }

  resetZoom(): void {
    this.previewZoom = 1;
  }

  trackByItem(index: number, item: any): any {
    return item?.Plan_ID || item?.barcode || item?.DocID || item?.PartNo || index;
  }

  ngOnDestroy(): void {
    this.stopStep2FocusLock();
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
    }
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.sideToastTimer) {
      clearTimeout(this.sideToastTimer);
    }
    if (this.paperAutoDebounceTimer) {
      clearTimeout(this.paperAutoDebounceTimer);
    }
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
    }
    if (this.printPreviewBlobUrl) {
      URL.revokeObjectURL(this.printPreviewBlobUrl);
    }
  }
}

