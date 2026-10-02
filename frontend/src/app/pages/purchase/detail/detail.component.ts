import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectionStrategy, ChangeDetectorRef, HostListener, OnDestroy } from '@angular/core';
import { SidebarPurchaseComponent } from '../../../components/sidebar/sidebarPurchase.component';
import { NotificationComponent } from '../../../components/notification/notification.component';
import { RouterOutlet } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription, interval, Observable, of } from 'rxjs';
import { DetailPurchaseRequestlistService } from '../../../core/services/DetailPurchaseRequestlist.service';
import { PCPlanService } from '../../../core/services/PCPlan.service';
import { FileReadService } from '../../../core/services/FileRead.service';
import { AuthService } from '../../../core/services/auth.service';
import * as ExcelJS from 'exceljs';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { PurchaseHistoryservice } from '../../../core/services/PurchaseHistory.service';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [
    SidebarPurchaseComponent,
    CommonModule,
    FormsModule,
    RouterOutlet,
    NotificationComponent,
    NgSelectModule
  ],
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DetailComponent implements OnInit, OnDestroy {
  as400Config: any = { employeeId: '', pcName: '' };
  
  loadAS400Config() {
    this.purchasehistory.getAS400Config().subscribe({
      next: (config: any) => {
        this.as400Config = config;
      },
      error: (err: any) => console.error('Failed to load AS400 Config:', err)
    });
  }

  isLoading: boolean = false;
  userRole: string = 'view';
  allRequests: any[] = [];
  filteredRequests: any[] = [];
  request: any[] = [];
  allSetupRequests: any[] = [];
  setupRequests: any[] = [];
  currentUser: any = null;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 20;
  totalPages: number = 1;
  pages: number[] = [];
  showCompleted: boolean = false;
  isMockMode: boolean = false;

  private refreshSubscription: Subscription = new Subscription();

  mockCutStatusCache: { [key: string]: string } = {}; // Cache to preserve green/red colors across data reloads

  // Date Filter
  dateFilterType: 'both' | 'req' | 'due' = 'both';
  // Req Date Filter
  reqDateFrom: string | null = null;
  reqDateTo: string | null = null;

  // Due Date Filter
  dueDateFrom: string | null = null;
  dueDateTo: string | null = null;

  // Dropdown Lists
  divisionList = [
    { label: 'GM', value: '7122' },
    { label: 'PMC', value: '71DZ' }
  ];
  StatusList = [
    { label: 'Wait', value: 'Waiting' },
    { label: 'Complete', value: 'Complete' }
  ];
  ToolingList = [
    { label: 'Cutting Tool', value: 'Cutting Tool' },
    { label: 'Setup Tool', value: 'Setup Tool' }
  ];

  PartNoList: any[] = [];
  ItemNoList: any[] = [];
  SpecList: any[] = [];
  ProcessList: any[] = [];
  ReqDateList: any[] = [];
  DueDateList: any[] = [];
  CaseList: any[] = [];
  DocumentNoList: any[] = [];
  MCTypeList: any[] = [];
  MRNoList: any[] = [];
  FacList: any[] = []; // Fac List
  RequesterList: any[] = [];
  PHStockLocList: any[] = [];

  // New For Production Filter Lists
  MfgOrderNoList: any[] = [];
  MCNoList: any[] = [];
  ItemNameList: any[] = [];
  ReqQtyList: any[] = [];
  TotalQtyList: any[] = [];
  PhoneList: any[] = [];

  // Selected Filters
  Division_: string | null = null;
  PartNo_: string | null = null;
  ItemNo_: string | null = null;
  Spec_: string | null = null;
  Process_: string | null = null;
  Fac_: string | null = null; // Fac Filter
  ReqDate_: string | null = null;
  DueDate_: string | null = null;
  Case_: string | null = null;
  DocumentNo_: string | null = null;
  Status_: string | null = null;
  Tooling_: string | null = null;
  Requester_: string | null = null;

  // New Filters
  MRNo_: string | null = null;
  DueDateFilter_: string | null = null;
  MCType_: string | null = null;
  ItemNoFilter_: string | null = null;
  PHStockLoc_: string | null = null;
  MfgOrderNo_: string | null = null;
  MCNo_: string | null = null;
  ItemName_: string | null = null;
  ReqQty_: string | null = null;
  TotalQty_: string | null = null;
  Phone_: string | null = null;
  Remark_: string | null = null;

  RemarkList: any[] = [];

  showHoldOnly: boolean = false;

  // Selected Item Details
  PartNo: any[] = [];
  ItemNo: any[] = [];
  SPEC: any[] = [];

  // Sorting & Editing
  sortKey: string = '';
  sortAsc: boolean = true;
  editingIndex: { [key: string]: number | null } = {};
  newRequestData: any = {};
  selectAllChecked = false;

  itemNo!: string;
  displayIndex!: number;
  searchTerms: any = {};
  highlightedRow: number | null = null;

  isIssueRemark(remark: string): boolean {
    return this.isWaitRemark(remark);
  }

  // Document Filter
  showDocumentFilter = false;
  searchDocText = '';
  allDocsSelected = false;

  get documentItems() {
    return this.request.map(it => ({
      DocNo: it.DocNo,
      selected: it.Selection || false
    }));
  }

  filteredDocuments() {
    return this.documentItems.filter(doc =>
      doc.DocNo?.toLowerCase().includes(this.searchDocText.toLowerCase())
    );
  }

  toggleDocumentFilter() {
    this.showDocumentFilter = !this.showDocumentFilter;
  }

  toggleAllDocuments(event: any) {
    this.allDocsSelected = event.target.checked;
    this.request.forEach(r => r.Selection = this.allDocsSelected);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
    }
  }

  onDocumentCheckboxChange(doc: any) {
    const item = this.request.find(r => r.DocNo === doc.DocNo);
    if (item) item.Selection = doc.selected;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
    }
  }

  constructor(
    private purchasehistory: PurchaseHistoryservice,
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private router: Router,
    private DetailPurchase: DetailPurchaseRequestlistService,
    private pcPlanService: PCPlanService,
    private FileReadService: FileReadService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  isViewer(): boolean {
    return this.authService.isViewer();
  }

  ngOnInit() { 
    this.userRole = this.authService.getUserRole() || 'view';
    this.loadAS400Config();
    this.route.paramMap.subscribe(p => {
      this.itemNo = p.get('itemNo') || '';
    });

    this.route.queryParams.subscribe(params => {
      if (params['case']) {
        this.Case_ = params['case'];
        // Reverted: Case Setup view is now separate component
        this.Tooling_ = 'Cutting Tool';
      }
      if (params['tool']) {
        this.Tooling_ = params['tool'];
      }
      // If no params, Tooling_ remains null (Blank Page)
    });

    if (isPlatformBrowser(this.platformId)) {
      const userStr = sessionStorage.getItem('user');
      if (userStr) this.currentUser = JSON.parse(userStr);

      this.loadAllData();
      this.get_ItemNo();

      // Auto-refresh every 30 seconds
      this.refreshSubscription = interval(30000).subscribe(() => {
        if (!this.hasUnsavedChanges()) {
          this.loadAllData();
        }
      });
    }
  }

  toggleHoldFilter() {
    this.showHoldOnly = !this.showHoldOnly;
    this.onFilter();
  }

  ngOnDestroy() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  updatePagination() {
    this.totalPages = Math.ceil(this.request.length / this.pageSize) || 1;

    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    // Sliding window logic
    let startPage = Math.max(1, this.currentPage - 2);
    let endPage = Math.min(this.totalPages, startPage + 4);

    // Adjust if we are near the end and the window is smaller than 5
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    this.pages = [];
    for (let i = startPage; i <= endPage; i++) {
      this.pages.push(i);
    }

    this.updateSelectAllCheckedState();

    this.cdr.markForCheck();
  }

  get displayedRequests() {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.request.slice(startIndex, endIndex);
  }

  onPageChange(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      // Reset selection when switching pages
      this.request.forEach(r => r.Selection = false);
      this.selectAllChecked = false;

      this.currentPage = page;
      this.updatePagination();
    }
  }

  hasUnsavedChanges(): boolean {
    // 1. Is any row currently in edit mode?
    if (Object.keys(this.editingIndex).length > 0) return true;

    // 2. Is any row selected? (User might be batching)
    if (this.request.some(r => r.Selection)) return true;

    // 3. Has any row been modified but not saved? (Dirty check)
    const isDirty = this.request.some(it => {
      const itemNoChanged = (it.ItemNo || '') !== (it.Req_ItemNo || '');
      const specChanged = (it.SPEC || '') !== (it.Req_SPEC || '');
      const qtyChanged = (it.QTY ?? 0) !== (it.Req_QTY ?? (it.QTY ?? 0));
      return itemNoChanged || specChanged || qtyChanged;
    });

    return isDirty;
  }

  /** Load both Cutting + Setup data in parallel, show only when BOTH are ready */
  loadAllData() {
    forkJoin({
      cutting: this.DetailPurchase.Detail_Request(),
      setup: this.DetailPurchase.Detail_Request_Setup()
    }).subscribe({
      next: ({ cutting, setup }) => {
        // --- 1 Month Filter Logic ---
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        oneMonthAgo.setHours(0, 0, 0, 0);
        const oneMonthAgoTime = oneMonthAgo.getTime();

        const isWithinOneMonth = (dateStr: any) => {
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return !isNaN(d.getTime()) && d.getTime() >= oneMonthAgoTime;
        };

        // Map Cutting Tool data
        if (Array.isArray(cutting)) {
          const validCutting = cutting.filter(it => isWithinOneMonth(it.DateTime_Record));
          this.allRequests = validCutting.map(it => ({
            ...it,
            ID_Request: it.ID_Request,
            Public_Id: it.Public_Id || it.ID_Request,
            Selection: false,
            ToolingType: it.ToolingType || 'CuttingTool',
            isMockTest: !!it.isMockTest,
            mockCutStatus: this.mockCutStatusCache[it.Public_Id || it.ID_Request] || null,
            QTY: it.QTY ?? it.Req_QTY,
            ACCOUNT: it.ACCOUNT ?? it.account,
            MCQTY: it.MCNo || it.MCQTY || '',
            MCNo: it.MCNo || it.MCQTY || '',
            _parsedRequestDate: it.DateTime_Record ? new Date(it.DateTime_Record) : null,
            _parsedDueDate: it.DueDate ? new Date(it.DueDate) : null,
            Req_ItemNo: it.ItemNo,
            Req_PartNo: it.PartNo,
            Req_SPEC: it.SPEC,
            Req_ItemName: it.ItemName,
            ON_HAND: parseInt(it.ON_HAND ?? it.STOCK_ON_HAND ?? 0, 10) || 0,
            STOCK_ON_HAND: parseInt(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0, 10) || 0,
            TableType: 'Cutting'
          }));
        } else {
          this.allRequests = [];
        }

        // Map Setup Tool data
        if (Array.isArray(setup)) {
          const validSetup = setup.filter(it => isWithinOneMonth(it.DateTime_Record));
          this.allSetupRequests = validSetup.map(it => ({
            ...it,
            ID_Request: it.ID_RequestSetupTool,
            Public_Id: it.Public_Id || it.ID_RequestSetupTool,
            Selection: false,
            ToolingType: it.ToolingType || 'SetupTool',
            isMockTest: !!it.isMockTest,
            mockCutStatus: this.mockCutStatusCache[it.Public_Id || it.ID_RequestSetupTool] || null,
            QTY: it.QTY ?? it.Req_QTY,
            MCQTY: it.MCNo || it.MCQTY || '',
            MCNo: it.MCNo || it.MCQTY || '',
            _parsedRequestDate: it.DateTime_Record ? new Date(it.DateTime_Record) : null,
            _parsedDueDate: it.DueDate ? new Date(it.DueDate) : null,
            Req_ItemNo: it.ItemNo,
            Req_PartNo: it.PartNo,
            Req_SPEC: it.SPEC,
            Req_ItemName: it.ItemName,
            ON_HAND: parseInt(it.ON_HAND ?? it.STOCK_ON_HAND ?? 0, 10) || 0,
            STOCK_ON_HAND: parseInt(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0, 10) || 0,
            TableType: 'Setup'
          }));
        } else {
          this.allSetupRequests = [];
        }

        // Update once when both are ready
        this.updateMergedSource();
      },
      error: e => console.error('❌ Error loadAllData:', e)
    });
  }

  loadSetupData() {
    this.DetailPurchase.Detail_Request_Setup().subscribe({
      next: (response: any[]) => {
        if (!Array.isArray(response)) {
          this.allSetupRequests = [];
          this.setupRequests = [];
          return;
        }

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        oneMonthAgo.setHours(0, 0, 0, 0);
        const oneMonthAgoTime = oneMonthAgo.getTime();

        const isWithinOneMonth = (dateStr: any) => {
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return !isNaN(d.getTime()) && d.getTime() >= oneMonthAgoTime;
        };

        const validSetup = response.filter(it => isWithinOneMonth(it.DateTime_Record));

        const mapped = validSetup.map(it => ({
          ...it,
          ID_Request: it.ID_RequestSetupTool,
          Public_Id: it.Public_Id || it.ID_RequestSetupTool,
          Selection: false,
          ToolingType: it.ToolingType || 'SetupTool',
          isMockTest: !!it.isMockTest,
          mockCutStatus: this.mockCutStatusCache[it.Public_Id || it.ID_RequestSetupTool] || null,
          QTY: it.QTY ?? it.Req_QTY,
          MCQTY: it.MCNo || it.MCQTY || '',
          MCNo: it.MCNo || it.MCQTY || '',
          _parsedRequestDate: it.DateTime_Record ? new Date(it.DateTime_Record) : null,
          _parsedDueDate: it.DueDate ? new Date(it.DueDate) : null,
          Req_ItemNo: it.ItemNo,
          Req_PartNo: it.PartNo,
          Req_SPEC: it.SPEC,
          Req_ItemName: it.ItemName,
          ON_HAND: parseInt(it.ON_HAND ?? it.STOCK_ON_HAND ?? 0, 10) || 0,
          STOCK_ON_HAND: parseInt(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0, 10) || 0,
          TableType: 'Setup'
        }));

        this.allSetupRequests = mapped;
        this.updateMergedSource();

        this.cdr.markForCheck();
      },
      error: e => console.error('❌ Error loadSetupData:', e)
    });
  }

  /** Rebuild dropdown lists + re-apply filters after data changes */
  private updateMergedSource() {
    this.autoFillAllMissingNames();
    this.rebuildDropdownLists();
    this.onFilter(false); // Preserve current page (e.g. Page 3) on data refresh
    this.cdr.markForCheck();
  }

  onDivisionChange() {
    this.isLoading = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.onFilter();
      this.isLoading = false;
      this.cdr.markForCheck();
    }, 3000);
  }

  toggleMockMode() {
    this.isMockMode = !this.isMockMode;
    this.isLoading = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.onFilter();
      this.isLoading = false;
      this.cdr.markForCheck();
    }, 3000);
  }

  getDeduplicatedSource(): any[] {
    const merged = [...this.allRequests, ...this.allSetupRequests];
    const unique: any[] = [];
    const seen = new Set<string>();
    for (const item of merged) {
      const key = item.Public_Id || item.ID_Request;
      if (key) {
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      } else {
        unique.push(item);
      }
    }
    return unique;
  }

  rebuildDropdownLists(source: any[] = this.getDeduplicatedSource()) {
    const merged = source;
    const formatYYMMDD = (d: any) => {
      if (!d) return '';
      const dateObj = new Date(d);
      if (isNaN(dateObj.getTime())) return '';
      const yy = String(dateObj.getFullYear()).slice(-2);
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      return `${yy}${mm}${dd}`;
    };

    this.SpecList = Array.from(new Set(merged.map(x => x.Req_SPEC || x.SPEC || x.Specification))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.ProcessList = Array.from(new Set(merged.map(x => x.Process))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.CaseList = Array.from(new Set(merged.map(x => x.CASE))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.PartNoList = Array.from(new Set(merged.map(x => x.Req_PartNo || x.PartNo))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.ItemNoList = Array.from(new Set(merged.map(x => x.Req_ItemNo || x.ItemNo))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.DocumentNoList = Array.from(new Set(merged.map(x => x.DocNo))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.MCTypeList = Array.from(new Set(merged.map(x => x.MCType))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.MRNoList = Array.from(new Set(merged.map(x => x.MR_No))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.DueDateList = Array.from(new Set(merged.map(x => this.getEffectiveDueDate(x)))).filter(x => x && x !== '-').sort().map(x => ({ label: String(x), value: String(x) }));
    this.FacList = Array.from(new Set(merged.map(x => x.Fac))).filter(x => x != null && x !== '').sort().map(x => ({ label: String(x), value: String(x) }));
    this.RequesterList = Array.from(new Set(merged.map(x => x.Requester)))
      .filter(x => x && String(x).trim().toLowerCase() !== 'aon')
      .sort()
      .map(x => ({ label: String(x), value: String(x) }));
    this.PHStockLocList = Array.from(new Set(merged.map(x => x.MAIN_LOCATION))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));

    // Additional dropdown lists for For Production columns
    this.MfgOrderNoList = Array.from(new Set(merged.map(x => x.MFGOrderNo))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.MCNoList = Array.from(new Set(merged.map(x => x.MCQTY || x.MCNo))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.ItemNameList = Array.from(new Set(merged.map(x => x.Req_ItemName || x.ItemName || x.EnglishName || x.Name || x.ToolName))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.ReqQtyList = Array.from(new Set(merged.map(x => x.Req_QTY))).filter(x => x != null && x !== '').sort((a: any, b: any) => Number(a) - Number(b)).map(x => ({ label: String(x), value: String(x) }));
    this.TotalQtyList = Array.from(new Set(merged.map(x => x.Total))).filter(x => x != null && x !== '' && x !== '-').sort((a: any, b: any) => Number(a) - Number(b)).map(x => ({ label: String(x), value: String(x) }));
    this.PhoneList = Array.from(new Set(merged.map(x => x.PhoneNo || x.Phone))).filter(x => x).sort().map(x => ({ label: String(x), value: String(x) }));
    this.RemarkList = Array.from(new Set(merged.map(x => x.Remark))).filter(x => x != null && x !== '').sort().map(x => ({ label: String(x), value: String(x) }));
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

    // 1. ถ้ามีค่า Due Date กรอกไว้ใน DB -> ใช้ค่านั้นเป็นลำดับแรก 100%
    if (item.DueDate) {
      const formatted = this.formatYYMMDD(item.DueDate);
      if (formatted) return formatted;
    }

    // 2. ถ้า Due Date ว่าง -> ดึงรหัส YYMMDD 6 หลักท้ายของชื่อ Document (DocNo)
    const docStr = String(item.DocNo || '').trim();
    if (docStr.length >= 6) {
      const lastSix = docStr.slice(-6);
      if (/^\d{6}$/.test(lastSix)) {
        return lastSix;
      }
    }

    // 3. ถ้าไม่มีเลข 6 หลักท้ายในชื่อ Document -> ใช้วันที่เปิดสั่ง (DateTime_Record) + 7 วัน (ตามสถิติประวัติการตัดจ่ายจริงย้อนหลัง)
    if (item.DateTime_Record) {
      const reqDate = new Date(item.DateTime_Record);
      if (!isNaN(reqDate.getTime())) {
        reqDate.setDate(reqDate.getDate() + 7); // สถิติตัดจ่ายจริงย้อนหลังเฉลี่ย 7 วัน
        const yy = String(reqDate.getFullYear()).slice(-2);
        const mm = String(reqDate.getMonth() + 1).padStart(2, '0');
        const dd = String(reqDate.getDate()).padStart(2, '0');
        return `${yy}${mm}${dd}`;
      }
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

  trackByRequestId(index: number, item: any): string {
    return item.Public_Id || item.ID_Request;
  }

  get_ItemNo() {
    this.DetailPurchase.get_ItemNo().subscribe({
      next: (response: any[]) => {
        this.ItemNo = response.map(item => ({
          ...item,
          ItemName: item.ItemName || item.EnglishName || item.Name,
          SPEC: item.Specification || item.Spec || item.SPEC,
          ACCOUNT: item.ACCOUNT ?? item.account ?? ''
        }));
        this.autoFillAllMissingNames();
        this.cdr.markForCheck();
      },
      error: (e: any) => console.error("Error API get_ItemNo:", e),
    });
  }

  onQtyChange(row: any) {
    const index = this.request.findIndex(r => (r.Public_Id || r.ID_Request) === (row.Public_Id || row.ID_Request));
    if (index > -1) {
      this.request[index].QTY = row.QTY;
    }
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
    }
  }

  updateSelectAllCheckedState() {
    const displayed = this.displayedRequests;
    if (displayed.length === 0) {
      this.selectAllChecked = false;
    } else {
      this.selectAllChecked = displayed.every(item => item.Selection);
    }
  }

  onIndividualSelectionChange() {
    this.updateSelectAllCheckedState();
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
    }
  }

  toggleAllCheckboxes() {
    if (this.selectAllChecked) {
      Swal.fire({
        title: 'Select All Options',
        text: 'Do you want to select all items on the current page only, or select all items across all pages?',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'All Pages',
        denyButtonText: 'Current Page Only',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#3085d6',
        denyButtonColor: '#4f46e5',
        cancelButtonColor: '#aaa',
        allowOutsideClick: false
      }).then((result) => {
        if (result.isConfirmed) {
          // Select all pages
          this.request.forEach(item => item.Selection = true);
          this.selectAllChecked = true;
          Swal.fire({ icon: 'success', title: 'Selected All Pages', text: `All ${this.request.length} items selected.`, timer: 1200, showConfirmButton: false });
        } else if (result.isDenied) {
          // Select only current page
          this.request.forEach(item => item.Selection = false);
          this.displayedRequests.forEach(item => item.Selection = true);
          this.selectAllChecked = true;
          Swal.fire({ icon: 'success', title: 'Selected Current Page', text: `All items on page ${this.currentPage} selected.`, timer: 1200, showConfirmButton: false });
        } else {
          // User cancelled
          this.selectAllChecked = false;
          this.request.forEach(item => item.Selection = false);
        }
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
        }
        this.cdr.markForCheck();
      });
    } else {
      // Uncheck all
      this.request.forEach(item => item.Selection = false);
      this.selectAllChecked = false;
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
      }
      this.cdr.markForCheck();
    }
  }

  addNewRequest(newRequestData: any, rowIndex: number) {
    this.DetailPurchase.insertRequestBulk([newRequestData]).subscribe({
      next: (res: any) => {
        const idRequest = res?.data?.[0]?.ID_Request;
        if (!idRequest) { alert('Backend ไม่ส่งข้อมูลกลับมา'); return; }

        const newRow = {
          ...newRequestData,
          ...res.data[0],
          ID_Request: Number(idRequest),
          Selection: false,
          isNew: true,
          QTY: newRequestData.QTY ?? newRequestData.Req_QTY,
        };

        this.request.splice(rowIndex + 1, 0, newRow);
        this.editingIndex[newRow.ID_Request] = rowIndex + 1;
        this.updatePagination();

        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
        }
        Swal.fire({ icon: 'success', title: 'Successfully Added Data Row', showConfirmButton: false, timer: 1330 });
      },
      error: (err: any) => { console.error(err); }
    });
  }

  originalItemState: any = null;

  scrollToKeepRemarkVisible() {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const container = document.querySelector('.table-responsive');
      if (container) {
        const maxScroll = container.scrollWidth - container.clientWidth;
        container.scrollTo({ left: Math.max(0, maxScroll), behavior: 'smooth' });
      }
    }, 60);
  }

  startEdit(publicId: string, rowIndex: number) {
    this.editingIndex = {};
    this.editingIndex[publicId] = rowIndex;
    const item = this.request.find(r => r.Public_Id === publicId);
    if (item) {
      this.originalItemState = {
        ItemNo: item.ItemNo,
        QTY: item.QTY,
        MatLot: item.MatLot,
        Remark: item.Remark
      };
    }
    this.cdr.markForCheck();
    this.scrollToKeepRemarkVisible();
  }

  saveEdit(publicId: string, silent: boolean = false) {
    const item = this.request.find(r => (r.Public_Id || r.ID_Request) === publicId)
      || this.allRequests.find(r => (r.Public_Id || r.ID_Request) === publicId)
      || this.allSetupRequests.find(r => (r.Public_Id || r.ID_Request) === publicId);

    if (!item) return;

    this.syncSpecWithItemNo(item).subscribe({
      next: () => {
        const snapshot = { ...item };
        const hasId = item.ID_Request != null || item.Public_Id != null;

        if (!hasId) {
          // Insert new
        } else {
          // Check if there are actual changes before calling API and showing popup
          const isForceUpdate = this.originalItemState && 
            (this.originalItemState.ItemNo === 'FORCE_UPDATE' || this.originalItemState.Remark === 'FORCE_UPDATE');

          const hasChanges = !this.originalItemState ||
            isForceUpdate ||
            item.ItemNo !== this.originalItemState.ItemNo ||
            item.QTY !== this.originalItemState.QTY ||
            item.MatLot !== this.originalItemState.MatLot ||
            item.Remark !== this.originalItemState.Remark;

          // Immediately remove from editingIndex to prevent double submission
          delete this.editingIndex[publicId];
          this.cdr.markForCheck();

          if (!hasChanges) {
            this.originalItemState = null;
            return;
          }

          if (!item.TableType) {
            item.TableType = (item.Public_Id && String(item.Public_Id).startsWith('S')) || item.ToolingType === 'SetupTool' ? 'Setup' : 'Cutting';
          }

          this.DetailPurchase.updateRequest(item).subscribe({
            next: (res) => {
              item.isNew = false;
              if (isPlatformBrowser(this.platformId)) {
                localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
              }
              this.updatePagination();
              if (!silent) {
                Swal.fire({ 
                  toast: true, 
                  position: 'top-end', 
                  icon: 'success', 
                  title: 'Saved', 
                  showConfirmButton: false, 
                  timer: 1000 
                });
              }
              this.originalItemState = null;
              this.rebuildDropdownLists();
              this.cdr.markForCheck();
            },
            error: (err) => {
              Object.assign(item, snapshot);
              // Restore editing state on error so they can try again
              const index = this.request.findIndex(r => (r.Public_Id || r.ID_Request) === publicId);
              if (index > -1) {
                this.editingIndex[publicId] = index;
              }
              alert('เกิดข้อผิดพลาดในการบันทึกแถว');
              this.cdr.markForCheck();
            }
          });
        }
      }
    });
  }

  stopEdit(publicId: string) {
    this.saveEdit(publicId);
  }

  getAvailableCodes(item: any): any[] {
    if (!item) return [];
    
    const currentItemNo = String(item.ItemNo || '').trim().toUpperCase();
    const reqItemNo = String(item.Req_ItemNo || item.Req_Item_No || item.ReqItemNo || '').trim().toUpperCase();
    const previousItemNo = String(item.previousItemNo || '').trim().toUpperCase();
    
    const targetItemNo = currentItemNo || reqItemNo;
    if (!targetItemNo) return [];

    // Extract base prefix (e.g. "P122673" from "P122673N" or "P122673")
    const matchReq = reqItemNo.match(/^(.*?[0-9]+)/);
    const matchCur = currentItemNo.match(/^(.*?[0-9]+)/);
    const baseUpper = matchReq ? matchReq[1] : (matchCur ? matchCur[1] : targetItemNo);

    const reqSpec = String(item.Req_SPEC || item.SPEC || item.Specification || '').trim().toUpperCase();

    const list = this.ItemNo || [];
    
    // Priority: AR > A > A1 > A2 > AB > AB1 > NR > N > NB > NB1 > B > BR > (no suffix)
    const priority: { [key: string]: number } = {
      'AR': 1, 'A': 2, 'A1': 3, 'A2': 4, 'AB': 5, 'AB1': 6,
      'NR': 7, 'N': 8, 'NB': 9, 'NB1': 10, 'B': 11, 'BR': 12, '': 13
    };
    
    // Extract base number digits (e.g. "122484" from "P122484N")
    const digitsMatch = targetItemNo.match(/([0-9]{4,})/);
    const targetDigits = digitsMatch ? digitsMatch[1] : '';

    // 1. Find items in master list matching exact prefix or base part number digits AND exact SPEC
    const matches = list.filter((x: any) => {
      const xItemNo = String(x?.ItemNo || '').trim().toUpperCase();
      if (!xItemNo) return false;

      const xDigitsMatch = xItemNo.match(/([0-9]{4,})/);
      const xDigits = xDigitsMatch ? xDigitsMatch[1] : '';

      const matchPrefix = baseUpper.length >= 3 && xItemNo.startsWith(baseUpper);
      const matchDigits = targetDigits.length >= 4 && xDigits === targetDigits;

      if (!matchPrefix && !matchDigits) return false;

      // Both Item code prefix AND SPEC MUST MATCH!
      const targetSpec = reqSpec || String(item.SPEC || item.Specification || item.Spec || '').trim().toUpperCase();
      const xSpec = String(x?.SPEC || x?.spec || x?.Specification || x?.Spec || '').trim().toUpperCase();

      if (targetSpec && xSpec) {
        const normTarget = targetSpec.replace(/[\s\-_]+/g, '');
        const normX = xSpec.replace(/[\s\-_]+/g, '');
        if (normTarget !== normX) return false;
      }

      return true;
    });

    // 2. Only include items that HAVE STOCK (> 0) OR are the original/previous swapped items
    let available = matches.filter(x => {
      const xItemNo = String(x.ItemNo || '').trim().toUpperCase();
      const hasStock = Number(x.ON_HAND || x.STOCK_ON_HAND || 0) > 0;
      const isOriginal = (xItemNo === reqItemNo && reqItemNo.length > 0);
      const isPrevious = (xItemNo === previousItemNo && previousItemNo.length > 0);
      return hasStock || isOriginal || isPrevious;
    });

    // 3. Exclude the currently displayed ItemNo so the replaced code swaps places into the badge list
    available = available.filter(x => String(x.ItemNo).trim().toUpperCase() !== currentItemNo);

    // 4. Deduplicate by ItemNo
    const seen = new Set<string>();
    available = available.filter(x => {
      const key = String(x.ItemNo).trim().toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 5. Sort available options: items with stock > 0 first, then by priority
    available.sort((a, b) => {
      const stockA = Number(a.ON_HAND || a.STOCK_ON_HAND || 0);
      const stockB = Number(b.ON_HAND || b.STOCK_ON_HAND || 0);
      
      const suffixA = String(a.ItemNo).trim().toUpperCase().replace(baseUpper, '');
      const suffixB = String(b.ItemNo).trim().toUpperCase().replace(baseUpper, '');
      const pA = priority[suffixA] !== undefined ? priority[suffixA] : 99;
      const pB = priority[suffixB] !== undefined ? priority[suffixB] : 99;
      
      if (pA !== pB) return pA - pB;
      return stockB - stockA;
    });

    return available.slice(0, 10);
  }

  quickSwitchCode(item: any, newCodeItem: any) {
    if (!item || !newCodeItem) return;
    
    // Store current ItemNo as previousItemNo so it swaps into the badge list
    if (item.ItemNo && item.ItemNo !== newCodeItem.ItemNo) {
      item.previousItemNo = item.ItemNo;
    }
    
    // Force changes to bypass saveEdit check
    this.originalItemState = { ItemNo: 'FORCE_UPDATE' }; 
    item.ItemNo = newCodeItem.ItemNo;
    this.updateRowWithFound(item, newCodeItem);
    
    this.saveEdit(item.Public_Id, true); // silent save
  }

  holdItem(item: any) {
    Swal.fire({
      title: 'Wait Item',
      text: 'Please enter a remark (e.g. Out of stock, checking with owner):',
      input: 'text',
      inputPlaceholder: 'Remark / เหตุผล',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Wait',
      cancelButtonText: 'Cancel',
      inputValidator: (value) => {
        if (!value) {
          return 'You need to write something!';
        }
        return null;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        item.Remark = result.value;
        this.DetailPurchase.updateRequest(item).subscribe({
          next: () => {
            const ids = [item.Public_Id || item.ID_Request];
            this.DetailPurchase.updateStatusToComplete(ids, 'Hold', item.TableType).subscribe({
              next: () => {
                const idSet = new Set(ids);
                this.request.forEach(r => { if(idSet.has(r.ID_Request) || idSet.has(r.Public_Id)) r.Status = 'Hold'; });
                this.allRequests.forEach(r => { if(idSet.has(r.ID_Request) || idSet.has(r.Public_Id)) r.Status = 'Hold'; });
                this.allSetupRequests.forEach(r => { if(idSet.has(r.ID_Request) || idSet.has(r.Public_Id)) r.Status = 'Hold'; });
                this.setupRequests.forEach(r => { if(idSet.has(r.ID_Request) || idSet.has(r.Public_Id)) r.Status = 'Hold'; });
                this.onFilter();
                this.updatePagination();
                Swal.fire('Waiting!', 'Item is pending stock (WAIT).', 'success');
              }
            });
          }
        });
      }
    });
  }

  syncSpecWithItemNo(row: any): Observable<any> {
    if (!row || !row.ItemNo) return of(null);
    const targetItemNo = String(row.ItemNo).trim();
    const divisionId = row.Division || '71DZ'; // Default to PMC if not set

    // 1. Try local lookup first (for immediate feedback if possible)
    const isPMC = String(divisionId).trim().toUpperCase() === '71DZ' || String(divisionId).trim().toUpperCase() === 'PMC';
    const list = this.ItemNo || [];
    const foundLocal = list.find((x: any) => {
      if (typeof x === 'string') return String(x).trim() === targetItemNo;
      const xItemNo = String(x?.ItemNo).trim();
      if (xItemNo !== targetItemNo) return false;
      const xDivId = Number(x?.Division_Id);
      if (!xDivId) return true; // no division info on this record — best effort
      return isPMC ? xDivId === 2 : xDivId === 3;
    });

    if (foundLocal && typeof foundLocal !== 'string') {
      this.updateRowWithFound(row, foundLocal);
    }

    // 2. Always/Fallback to Server lookup for precision and to solve "Delay/Missing" issues
    return new Observable(observer => {
      this.DetailPurchase.getItemDetailsByNo(targetItemNo, divisionId).subscribe({
        next: (foundServer: any) => {
          if (foundServer) {
            this.updateRowWithFound(row, foundServer);
          } else {
            if (!foundLocal) { if (!row.isMockTest) { row.SPEC = ''; row.ItemName = ''; row.STOCK_ON_HAND = 0; row.ON_HAND = 0; row.MAIN_LOCATION = ''; row.MAIN_LOCATION_Name = ''; }
              this.cdr.markForCheck();
            }
          }
          observer.next(row);
          observer.complete();
        },
        error: (err) => {
          console.warn(`Item lookup failed for ${targetItemNo} on server:`, err);
          // If not found on server AND not found locally, then clear
          if (!foundLocal) { if (!row.isMockTest) { row.SPEC = ''; row.ItemName = ''; row.STOCK_ON_HAND = 0; row.ON_HAND = 0; row.MAIN_LOCATION = ''; row.MAIN_LOCATION_Name = ''; }
            this.cdr.markForCheck();
          }
          observer.next(row);
          observer.complete();
        }
      });
    });
  }

  private updateRowWithFound(row: any, found: any) {
    const spec = found.SPEC || found.Specification || found.Spec;
    const itemName = found.ItemName || found.EnglishName || found.Name;
    const onHand = found.ON_HAND ?? found.STOCK_ON_HAND ?? found.OnHand ?? 0;
    const mainLocation = found.MAIN_LOCATION || found.MainLocation || found.MAIN_LOCATION_Name || found.StockLocation || found.Stock_Location || found.LOCATION || found.Location || found.PHStockLoc || found.PH_Stock_Loc || found.PH_STOCK_LOCATION || '';

    if (typeof spec !== 'undefined' && spec !== null) {
      row.SPEC = String(spec).trim();
    }
    if (typeof itemName !== 'undefined' && itemName !== null) {
      row.ItemName = String(itemName).trim();
    }

    if (!row.isMockTest) {
      row.STOCK_ON_HAND = onHand;
      row.ON_HAND = onHand;
    }
    if (mainLocation && String(mainLocation).trim() !== '') {
      row.MAIN_LOCATION = String(mainLocation).trim();
      row.MAIN_LOCATION_Name = String(mainLocation).trim();
    }

    this.cdr.markForCheck();
  }

  onItemNoChange(event: any, item: any) {
    this.syncSpecWithItemNo(item).subscribe();
  }

  isWaitRemark(remark: any): boolean {
    if (!remark) return false;
    const str = String(remark).trim().toLowerCase();
    const cleanStr = str.replace(/\s+/g, '');
    return str.includes('ติดจ่าย') || str.includes('shortage') || cleanStr.includes('st=0') || str.includes('wait rec') || str.includes('wait rt');
  }

  isOkRemark(remark: any): boolean {
    if (!remark) return false;
    const str = String(remark).trim().toLowerCase();
    return str === 'ok' || str.includes('ok');
  }

  quickSetRemark(item: any, value: string, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!item) return;
    item.Remark = value;
    this.updateStatusFromRemark(item);
    const publicId = item.Public_Id || item.ID_Request;
    if (publicId) {
      this.originalItemState = { Remark: 'FORCE_UPDATE' };
      delete this.editingIndex[publicId];
      this.saveEdit(publicId, false);
    }
  }

  onRemarkEnter(item: any) {
    if (!item) return;
    this.updateStatusFromRemark(item);
    const publicId = item.Public_Id || item.ID_Request;
    if (publicId) {
      this.originalItemState = { Remark: 'FORCE_UPDATE' };
      delete this.editingIndex[publicId];
      this.saveEdit(publicId, false);
    }
  }

  onRemarkSelectChange(item: any, newValue: string) {
    if (!item) return;
    item.Remark = newValue;
    this.updateStatusFromRemark(item);
    const publicId = item.Public_Id || item.ID_Request;
    if (publicId) {
      this.originalItemState = { Remark: 'FORCE_UPDATE' };
      delete this.editingIndex[publicId];
      this.saveEdit(publicId, false);
    }
  }

  onRemarkInputChange(item: any) {
    if (!item) return;
    this.updateStatusFromRemark(item);
    const publicId = item.Public_Id || item.ID_Request;
    if (publicId) {
      this.originalItemState = { Remark: 'FORCE_UPDATE' };
      delete this.editingIndex[publicId];
      this.saveEdit(publicId, false);
    }
  }

  updateStatusFromRemark(item: any) {
    if (!item) return;
    if (this.isOkRemark(item.Remark)) {
      item.Status = 'Issue';
    } else if (this.isWaitRemark(item.Remark)) {
      item.Status = 'Hold';
    } else if (item.Remark && (!item.Status || item.Status === '')) {
      item.Status = 'Waiting';
    }
    this.cdr.markForCheck();
  }

  deleteRow(rowIndex: number) {
    // Determine real index based on current page
    const realIndex = (this.currentPage - 1) * this.pageSize + rowIndex;
    const item = this.request[realIndex];

    if (!item) return;

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
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #ef4444;">${item.Req_ItemNo || item.ItemNo || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${item.MFGOrderNo || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${item.DocNo || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${item.Req_PartNo || item.PartNo || '-'}</td>
              <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.Req_ItemName || item.ItemName || '-'}</td>
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
        if (item.isNew) {
          this.request.splice(realIndex, 1);
          delete this.editingIndex[item.ID_Request];
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
          }
          this.updatePagination();
          Swal.fire({
            icon: 'success',
            title: 'Deleted / ลบเรียบร้อย',
            text: 'ลบแถวเรียบร้อย',
            showConfirmButton: false,
            timer: 1500
          });
        } else {
          this.DetailPurchase.deleteRequest(item.ID_Request).subscribe({
            next: () => {
              this.request.splice(realIndex, 1);
              delete this.editingIndex[item.ID_Request];
              if (isPlatformBrowser(this.platformId)) {
                localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
              }
              this.updatePagination();
              Swal.fire({
                icon: 'success',
                title: 'Deleted / ลบเรียบร้อย',
                text: 'ลบข้อมูลสำเร็จ',
                showConfirmButton: false,
                timer: 1500
              });
            },
            error: err => {
              Swal.fire({
                icon: 'error',
                title: 'Error / เกิดข้อผิดพลาด',
                text: 'ไม่สามารถลบข้อมูลได้'
              });
            }
          });
        }
      }
    });
  }

  isDeletingSelected = false;

  deleteSelected() {
    if (this.isDeletingSelected) return;

    const selectedItems = (this.request || [])
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
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Req Item No</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Mfg Order No.</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 130px;">Doc No</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 120px;">Part No.</th>
              <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 180px;">Item Name</th>
              <th style="padding: 10px; text-align: center; width: 60px;">QTY</th>
            </tr>
          </thead>
          <tbody>
            ${selectedItems.map((it, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f7fafc'};">
                <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
                <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${it.Division || '-'}</td>
                <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #ef4444; white-space: nowrap;">${it.Req_ItemNo || it.ItemNo || '-'}</td>
                <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.MFGOrderNo || '-'}</td>
                <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.DocNo || '-'}</td>
                <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.Req_PartNo || it.PartNo || '-'}</td>
                <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${it.Req_ItemName || it.ItemName || ''}">${it.Req_ItemName || it.ItemName || '-'}</td>
                <td style="padding: 8px 10px; font-weight: bold; text-align: center; color: #ef4444;">${it.QTY}</td>
              </tr>
            `).join('')}
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
        this.cdr.markForCheck();

        // Separate new rows (local only) and database rows (need API calls)
        const localRows = selectedItems.filter(it => it.isNew);
        const dbRows = selectedItems.filter(it => !it.isNew);

        // Delete local rows immediately
        localRows.forEach(item => {
          const idx = this.request.findIndex(r => (r.Public_Id || r.ID_Request) === (item.Public_Id || item.ID_Request));
          if (idx > -1) {
            this.request.splice(idx, 1);
            delete this.editingIndex[item.ID_Request];
          }
        });

        if (dbRows.length === 0) {
          // Only local rows were deleted
          this.isDeletingSelected = false;
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
          }
          this.updatePagination();
          Swal.fire({
            icon: 'success',
            title: 'Deleted / ลบเรียบร้อย',
            text: 'ลบแถวที่เลือกเรียบร้อย',
            showConfirmButton: false,
            timer: 1500
          });
          this.cdr.markForCheck();
          return;
        }

        // Run deletion calls in parallel using forkJoin
        const deleteObservables = dbRows.map(it => this.DetailPurchase.deleteRequest(it.ID_Request));

        forkJoin(deleteObservables).subscribe({
          next: () => {
            dbRows.forEach(item => {
              const idx = this.request.findIndex(r => (r.Public_Id || r.ID_Request) === (item.Public_Id || item.ID_Request));
              if (idx > -1) {
                this.request.splice(idx, 1);
                delete this.editingIndex[item.ID_Request];
              }

              // Also remove from allRequests/allSetupRequests
              const id = item.Public_Id || item.ID_Request;
              this.allRequests = this.allRequests.filter(r => (r.Public_Id || r.ID_Request) !== id);
              this.allSetupRequests = this.allSetupRequests.filter(r => (r.Public_Id || r.ID_Request) !== id);
              this.setupRequests = this.setupRequests.filter(r => (r.Public_Id || r.ID_Request) !== id);
            });

            this.isDeletingSelected = false;
            if (isPlatformBrowser(this.platformId)) {
              localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
            }
            this.updatePagination();
            Swal.fire({
              icon: 'success',
              title: 'Deleted / ลบเรียบร้อย',
              text: 'ลบข้อมูลสำเร็จทั้งหมด',
              showConfirmButton: false,
              timer: 1500
            });
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.isDeletingSelected = false;
            Swal.fire({
              icon: 'error',
              title: 'Error / เกิดข้อผิดพลาด',
              text: 'ไม่สามารถลบข้อมูลบางรายการได้ / Some items could not be deleted.'
            });
            this.cdr.markForCheck();
          }
        });
      }
    });
  }

  isCompleting = false;

  completeSelected() {
    if (this.isCompleting) return;

    // Allow: Waiting items AND Hold items that now have stock (auto-promoted)
    const selectedItems = (this.request || [])
      .filter(it => it?.Selection === true && 
        (it?.Status === 'Waiting' || 
         (it?.Status?.toLowerCase() === 'hold' && Number(it?.STOCK_ON_HAND ?? 0) > 0)));

    if (selectedItems.length === 0) {
      Swal.fire({ icon: 'error', title: 'Oops...', text: 'Please select at least one item to complete. (Hold items with ON_HAND=0 cannot be completed yet.)' });
      return;
    }

    this.confirmItem(selectedItems[0]);
  }

  confirmItem(item: any) {
    if (!item) return;

    // Accept: Waiting items + Hold items that now have stock (restored)
    let selectedItems = this.request.filter(it => 
      it.Selection === true && 
      (it.Status === 'Waiting' || (it.Status?.toLowerCase() === 'hold' && Number(it.STOCK_ON_HAND ?? 0) > 0))
    );
    if (selectedItems.length === 0) {
      selectedItems = [item];
    } else if (!selectedItems.some(it => (it.Public_Id || it.ID_Request) === (item.Public_Id || item.ID_Request))) {
      selectedItems.push(item);
    }

    // Sync all selected items first to ensure we have the latest item details before confirming
    const syncObservables = selectedItems.map(it => this.syncSpecWithItemNo(it));
    forkJoin(syncObservables).subscribe({
      next: () => {
        // Stop editing state on the synced items
        selectedItems.forEach(it => {
          delete this.editingIndex[it.Public_Id];
        });
        this.cdr.markForCheck();

        // Proceed with validation and confirm UI
        selectedItems.forEach(it => {
          if (it.QTY == null || it.QTY === '') it.QTY = it.Req_QTY ?? 0;
        });

        const invalidItems = selectedItems.filter(it => it.QTY == null || it.QTY === '');
        if (invalidItems.length > 0) {
          Swal.fire({
            icon: 'warning',
            title: 'Incomplete data',
            text: `Please fill QTY for the selected items before confirming.`
          });
          return;
        }

          // --- SMART ZERO STOCK FILTER ---
          const zeroStockItems = selectedItems.filter(it => Number(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0) <= 0);
          const validItems = selectedItems.filter(it => Number(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0) > 0);

          if (validItems.length === 0 && zeroStockItems.length > 0) {
            Swal.fire({
              icon: 'error',
              title: 'ไม่สามารถดำเนินการได้',
              text: 'ทุกรายการที่คุณเลือกไม่มียอดคงเหลือ (On Hand = 0) ไม่สามารถตัดสต๊อกได้'
            });
            return;
          }

          // Keep only valid items for confirmation
          selectedItems = validItems;

          let zeroStockHtml = '';
          if (zeroStockItems.length > 0) {
            zeroStockHtml = `
              <div style="margin-top: 10px; margin-bottom: 10px; padding: 10px; background-color: #fff5f5; border: 1px solid #fc8181; border-radius: 6px; color: #c53030; font-size: 13px; text-align: left;">
                <b>แจ้งเตือน:</b> มี ${zeroStockItems.length} รายการถูกข้ามไปเนื่องจาก On Hand เป็น 0<br>
                ${zeroStockItems.map(it => `• ${it.ItemNo} (Part: ${it.PartNo || '-'}) - ไม่ถูกส่งไปตัด`).join('<br>')}
              </div>
            `;
          }


        // --- NEW BUSINESS RULE: Check for Insufficient Stock ---
        const insufficientItems = selectedItems.filter(it => { const stock = Number(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0); return stock > 0 && Number(it.QTY || 0) > stock; });
        if (insufficientItems.length > 0) {
          const missingRemarks = insufficientItems.filter(it =>
            !it.Remark ||
            it.Remark.trim() === '' ||
            it.Remark.trim().toLowerCase().startsWith('mock item')
          );
          if (missingRemarks.length > 0) {
            Swal.fire({
              icon: 'error',
              title: 'Stock Insufficient!',
              html: `You are trying to issue more QTY than available On Hand.<br><br>If you must proceed, you <b>MUST fill in a Remark</b> explaining why for the affected items.`
            });
            return;
          }
        }
        // --------------------------------------------------------

        const itemsHtml = `
          <div style="text-align: left; margin-bottom: 15px; font-family: 'Inter', sans-serif; font-size: 14px;">
            <span style="font-weight: 600; color: #e53e3e;">Warning:</span> You are about to confirm the following <b>${selectedItems.length}</b> selected item(s). This action cannot be undone!
          </div>
            ${zeroStockHtml}
          <div style="max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.06);">
            <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; font-size: 13px; text-align: left; min-width: 1100px;">
              <thead>
                <tr style="background-color: #edf2f7; color: #2d3748; font-weight: bold; border-bottom: 2px solid #cbd5e0; position: sticky; top: 0; z-index: 10;">
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; text-align: center; width: 40px;">No</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 60px;">Div</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 115px;">Item No</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 115px;">Mfg Order No.</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 125px;">Doc No</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 110px;">Part No.</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 100px;">Process</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 100px;">Machine</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 160px;">Item Name</th>
                  <th style="padding: 10px; border-right: 1px solid #cbd5e0; width: 160px;">Spec</th>
                  <th style="padding: 10px; text-align: center; width: 60px;">QTY</th>
                </tr>
              </thead>
              <tbody>
                ${selectedItems.map((it, idx) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f7fafc'};">
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${it.Division || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #3182ce; white-space: nowrap;">${it.ItemNo || it.Req_ItemNo || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.MFGOrderNo || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.DocNo || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; white-space: nowrap;">${it.Req_PartNo || it.PartNo || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${it.Process || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0;">${it.MCType || it.MCNo || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${it.ItemName || it.Req_ItemName || ''}">${it.ItemName || it.Req_ItemName || '-'}</td>
                    <td style="padding: 8px 10px; border-right: 1px solid #e2e8f0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${it.SPEC || it.Req_SPEC || ''}">${it.SPEC || it.Req_SPEC || '-'}</td>
                    <td style="padding: 8px 10px; font-weight: bold; text-align: center; color: #38a169;">${it.QTY}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        Swal.fire({
          title: 'Confirm items?',
          html: itemsHtml,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#3085d6',
          cancelButtonColor: '#d33',
          confirmButtonText: 'Yes, confirm!',
          cancelButtonText: 'Cancel',
          width: '1200px'
        }).then((result) => {
          if (result.isConfirmed) {
            this.isCompleting = true;
            this.cdr.markForCheck();

            const updateQtyObservables = selectedItems.map(it =>
              this.DetailPurchase.updateRequest(it)
            );

            forkJoin(updateQtyObservables).subscribe({
              next: () => {
                const completeItems = selectedItems.filter(it => Number(it.QTY) >= Number(it.Req_QTY ?? it.QTY));
                const holdItems = selectedItems.filter(it => Number(it.QTY) > 0 && Number(it.QTY) < Number(it.Req_QTY ?? it.QTY));

                const completeIds = completeItems.map(it => it.Public_Id || it.ID_Request);
                const holdIds = holdItems.map(it => it.Public_Id || it.ID_Request);

                const statusObservables = [];
                if (completeIds.length > 0) {
                  statusObservables.push(this.DetailPurchase.updateStatusToComplete(completeIds, 'Complete', completeItems[0].TableType));
                }
                if (holdIds.length > 0) {
                  statusObservables.push(this.DetailPurchase.updateStatusToComplete(holdIds, 'Hold', holdItems[0].TableType));
                }

                if (statusObservables.length === 0) {
                  this.isCompleting = false;
                  return;
                }

                forkJoin(statusObservables).subscribe({
                  next: (responses: any[]) => {
                    this.isCompleting = false;

                    if (this.isMockMode) {
                      let hasFailures = false;
                      let allZeroStockItems: any[] = [];

                      responses.forEach(res => {
                        if (res?.validIds) {
                          res.validIds.forEach((vid: string) => {
                            this.mockCutStatusCache[vid] = 'SUCCESS';
                            setTimeout(() => {
                              delete this.mockCutStatusCache[vid];
                              this.onFilter();
                              this.cdr.markForCheck();
                            }, 3000);
                          });
                        }
                        if (res?.invalidIds) {
                          res.invalidIds.forEach((vid: string) => {
                            this.mockCutStatusCache[vid] = 'FAIL';
                            hasFailures = true;
                          });
                        }
                        if (res?.zeroStockIds && res.zeroStockIds.length > 0) {
                          // Keep zero-stock items visible with Hold status
                          res.zeroStockIds.forEach((vid: string) => {
                            const found = this.request.find((r: any) => r.Public_Id === vid || r.ID_Request === vid);
                            if (found) found.Status = 'Hold';
                            const found2 = this.allRequests.find((r: any) => r.Public_Id === vid || r.ID_Request === vid);
                            if (found2) found2.Status = 'Hold';
                          });
                          if (res?.zeroStockItems) {
                            allZeroStockItems = [...allZeroStockItems, ...res.zeroStockItems];
                          }
                        }
                      });

                      // Build alert
                      if (allZeroStockItems.length > 0 && !hasFailures) {
                        const listHtml = allZeroStockItems.map((it: any) =>
                          `<li style="text-align:left;padding:4px 0;"><b>${it.ItemNo}</b> (PartNo: ${it.PartNo}) — ON HAND = <b style="color:#e53e3e;">0</b></li>`
                        ).join('');
                        Swal.fire({
                          icon: 'warning',
                          title: 'ตัดสำเร็จบางส่วน',
                          html: `
                            <div style="text-align:center;margin-bottom:8px;color:#38a169;font-weight:600;">✅ รายการที่มีสต็อก → ส่งไป ISSUE AS400 แล้ว</div>
                            <hr/>
                            <div style="text-align:center;margin-bottom:6px;color:#e53e3e;font-weight:600;">⚠️ รายการต่อไปนี้ ON HAND = 0 (ไม่ส่งไป AS400):</div>
                            <ul style="list-style:none;padding:0;margin:0;">${listHtml}</ul>
                          `,
                          confirmButtonText: 'รับทราบ'
                        });
                      } else if (allZeroStockItems.length > 0 && hasFailures) {
                        const zeroHtml = allZeroStockItems.map((it: any) =>
                          `<li style="text-align:left;padding:2px 0;"><b>${it.ItemNo}</b> — ON HAND = 0</li>`
                        ).join('');
                        Swal.fire({ icon: 'warning', title: 'มีรายการที่ไม่ผ่าน', html: `<div style="color:#e53e3e;font-weight:600;">⚠️ ON HAND = 0:</div><ul style="list-style:none;padding:0;">${zeroHtml}</ul><div style="margin-top:8px;color:#744210;">และมีรายการที่ข้อมูลไม่ครบอีกด้วยครับ</div>`, confirmButtonText: 'รับทราบ' });
                      } else if (hasFailures) {
                        Swal.fire({ icon: 'warning', title: 'ข้อมูลบางรายการไม่ครบ!', text: 'มีบางรายการที่ข้อมูลช่องสีเหลืองไม่ครบ ระบบจึงข้ามรายการนั้นและแสดงเป็นแถบสีแดงครับ ส่วนรายการที่ข้อมูลครบจะถูกตัดตามปกติ' });
                      } else {
                        
                        // --- Mock Auto AS400 Trigger ---
                        const isAutoFireEnabled = localStorage.getItem('as400AutoFireEnabled') === 'true';
                        if (completeItems.length > 0 && isAutoFireEnabled) {
                          const d = new Date();
                          const mappedAS400Data = completeItems.map((req: any) => {
                            let warehouseVal = "";
                            const divCode = (req.Division || this.Division_ || '').toString().trim();
                            if (divCode === '7122' || divCode === 'GM') { warehouseVal = "A"; }
                            else { warehouseVal = "C"; } // simplified fallback for mock
                            return {
                              "ItemNo": req.ItemNo || "", "Quantity": req.QTY || 0, "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
                              "DOCNo": req.DocNo || "", "TransactionYear": d.getFullYear().toString(),
                              "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'), "TransactionDay": d.getDate().toString().padStart(2, '0'),
                              "WareHouse": warehouseVal, "MaterialLot": req.MatLot || "",
                              "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFGOrderNo || "") : (req.PartNo || ""),
                              "EmpID": this.as400Config.employeeId || "", "Pcname": this.as400Config.pcName || "",
                              "Public_Id": req.Public_Id, "isMockTest": true
                            };
                          });
                          this.purchasehistory.exportToAS400(this.Division_!, mappedAS400Data).subscribe({
                            next: (res: any) => {
                              Swal.fire({ icon: 'success', title: 'ตัดจำลองสำเร็จ (พร้อมยิง AS400 จำลอง)', text: 'ระบบตัดจำลองและจำลองยิงเข้า AS400 เรียบร้อย', timer: 2500, showConfirmButton: false });
                            },
                            error: (err: any) => console.error(err)
                          });
                        } else {
                          Swal.fire({ icon: 'success', title: 'ตัดจำลองสำเร็จ', text: 'ข้อมูลครบถ้วน ถูกตัดจำลองเข้า 8g เรียบร้อยครับ', timer: 2000, showConfirmButton: false });
                        }

                      }
                    } else {
                      
                      // --- AUTO AS400 TRIGGER ---
                      const isAutoFireEnabled = localStorage.getItem('as400AutoFireEnabled') === 'true';
                      if (completeItems.length > 0 && isAutoFireEnabled) {
                        const d = new Date();
                        const mappedAS400Data = completeItems.map((req: any) => {
                          let warehouseVal = "";
                          const divCode = (req.Division || this.Division_ || '').toString().trim();
                          if (divCode === '7122' || divCode === 'GM') {
                            warehouseVal = "A";
                          } else if (divCode === '71DZ' || divCode === 'PMC') {
                            const isSetup = req.ToolType === 'Setup' || req.ToolingType === 'SetupTool' || (req.Public_Id && req.Public_Id.startsWith('S'));
                            const isCutting = req.ToolType === 'Cutting' || req.ToolingType === 'CuttingTool' || (req.Public_Id && req.Public_Id.startsWith('C'));
                            if (isSetup) warehouseVal = "F";
                            else if (isCutting) warehouseVal = "C";
                            else warehouseVal = "C";
                          }

                          return {
                            "ItemNo": req.ItemNo || "",
                            "ItemRevision": "",
                            "Quantity": req.QTY || 0,
                            "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
                            "DOCNo": req.DocNo || "",
                            "TransactionYear": d.getFullYear().toString(),
                            "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
                            "TransactionDay": d.getDate().toString().padStart(2, '0'),
                            "WareHouse": warehouseVal,
                            "StockControl": "",
                            "StockLocation": req.MAIN_LOCATION || req.MAIN_LOCATION_Name || req.Stock_Location || "",
                            "MaterialLot": req.MatLot || "",
                            "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFGOrderNo || req.MFG_Order_No || "") : (req.PartNo || ""),
                            "Vendor": "",
                            "EmpID": this.as400Config.employeeId || "",
                            "Pcname": this.as400Config.pcName || "",
                            "MCNo6Digit": req.MCNo6Digit || req.MC6Digit || "",
                            "MC_No": req.MC_No || req.MCNo || "",
                            "MCType": req.MCType || "",
                            "Public_Id": req.Public_Id,
                            "isMockTest": !!this.isMockMode
                          };
                        });

                        this.purchasehistory.exportToAS400(this.Division_!, mappedAS400Data).subscribe({
                          next: (res: any) => {
                            Swal.fire({
                              icon: 'success',
                              title: 'ตัดและยิงออโต้สำเร็จ!',
                              html: 'ยิงข้อมูลเข้า <b>AS400</b> อัตโนมัติเรียบร้อยแล้ว<br/>รายการแสดงเป็น <b>DONE</b> ในหน้า ISSUE AS400 แล้วครับ!',
                              timer: 3000,
                              showConfirmButton: false
                            });
                          },
                          error: (err: any) => {
                            Swal.fire({
                              icon: 'warning',
                              title: 'ตัดสำเร็จ แต่ยิง AS400 ไม่สำเร็จ',
                              text: 'ระบบอัปเดตสถานะสำเร็จ แต่เกิดขัดข้องตอนยิงเข้า AS400 อัตโนมัติ กรุณาลองยิงใหม่ที่หน้า History',
                            });
                            console.error(err);
                          }
                        });
                      } else {
                        Swal.fire({ icon: 'success', title: 'Success', text: 'Completed successfully', timer: 1000, showConfirmButton: false });
                      }
                      // --------------------------

                    }

                    selectedItems.forEach(it => it.Selection = false);

                    const completeIdSet = new Set(completeIds);
                    const holdIdSet = new Set(holdIds);

                    // Remove only completed items from lists
                    this.request = this.request.filter(r => !completeIdSet.has(r.ID_Request) && !completeIdSet.has(r.Public_Id));
                    this.allRequests = this.allRequests.filter(r => !completeIdSet.has(r.ID_Request) && !completeIdSet.has(r.Public_Id));
                    this.allSetupRequests = this.allSetupRequests.filter(r => !completeIdSet.has(r.ID_Request) && !completeIdSet.has(r.Public_Id));
                    this.setupRequests = this.setupRequests.filter(r => !completeIdSet.has(r.ID_Request) && !completeIdSet.has(r.Public_Id));

                    // Update status for hold items instead of removing them
                    this.request.forEach(r => { if(holdIdSet.has(r.ID_Request) || holdIdSet.has(r.Public_Id)) { r.Status = 'Hold'; r.mockCutStatus = this.mockCutStatusCache[r.Public_Id || r.ID_Request] || null; } });
                    this.allRequests.forEach(r => { if(holdIdSet.has(r.ID_Request) || holdIdSet.has(r.Public_Id)) { r.Status = 'Hold'; r.mockCutStatus = this.mockCutStatusCache[r.Public_Id || r.ID_Request] || null; } });
                    this.allSetupRequests.forEach(r => { if(holdIdSet.has(r.ID_Request) || holdIdSet.has(r.Public_Id)) { r.Status = 'Hold'; r.mockCutStatus = this.mockCutStatusCache[r.Public_Id || r.ID_Request] || null; } });
                    this.setupRequests.forEach(r => { if(holdIdSet.has(r.ID_Request) || holdIdSet.has(r.Public_Id)) { r.Status = 'Hold'; r.mockCutStatus = this.mockCutStatusCache[r.Public_Id || r.ID_Request] || null; } });

                    selectedItems.forEach(it => {
                      delete this.editingIndex[it.Public_Id];
                    });

                    if (isPlatformBrowser(this.platformId)) {
                      localStorage.setItem('purchaseRequest', JSON.stringify(this.request));
                    }

                    this.onFilter();

                    // Send email notification back to requester (one per unique requester)
                    const requesterMap = new Map<string, any>();
                    selectedItems.forEach(it => {
                      const requester = it.Requester || it.Employee_ID;
                      if (requester && !requesterMap.has(requester)) {
                        requesterMap.set(requester, it);
                      }
                    });

                    requesterMap.forEach((sampleItem, requester) => {
                      const actionBy = this.currentUser?.Employee_Name || this.currentUser?.Username || 'Purchase Head';
                      const planDate = sampleItem.DueDate ? new Date(sampleItem.DueDate).toISOString().split('T')[0] : '-';
                      const comment = selectedItems.length > 1
                        ? `Bulk confirmed ${selectedItems.length} items by Purchase.`
                        : `Request for ${sampleItem.PartNo} / ${sampleItem.ItemNo} has been completed and confirmed.`;

                      this.pcPlanService.sendEmail(null, actionBy, planDate, comment, [], [requester], 'Complete').subscribe({
                        next: () => console.log(`Confirmation email sent to ${requester}`),
                        error: (err) => console.error(`Failed to send email to ${requester}`, err)
                      });
                    });

                    this.cdr.markForCheck();
                  },
                  error: err => {
                    Swal.fire({ icon: 'error', title: 'Confirm failed', text: err?.message || 'Update status failed' });
                    this.isCompleting = false;
                    this.cdr.markForCheck();
                  }
                });
              },
              error: err => {
                Swal.fire({ icon: 'error', title: 'Save failed', text: err?.message || 'Update details failed' });
                this.isCompleting = false;
                this.cdr.markForCheck();
              }
            });
          }
        });
      },
      error: err => {
        console.error('Failed to sync item details:', err);
      }
    });
  }

  openPdfFromPath(filePath: string) {
    if (!filePath) { alert('ไม่พบ path ของไฟล์'); return; }

    const cleanPath = filePath.replace(/^"|"$/g, '');
    this.FileReadService.loadPdfFromPath(cleanPath).subscribe({
      next: res => {
        if (isPlatformBrowser(this.platformId)) {
          const base64 = res.imageData.split(',')[1];
          const binary = atob(base64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
        }
      },
      error: err => { alert('ไม่สามารถโหลด PDF ได้'); }
    });
  }

  fileName = "RequestList_Export.xlsx";

  exportexcel() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const selectedItems = this.request.filter(item => item.Selection);

    if (selectedItems.length === 0) {
      Swal.fire({ icon: 'warning', title: 'No rows selected', text: 'Please select at least one row to export.' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    const columns = [
      { header: 'No.', key: 'no', width: 10 },
      { header: 'Document', key: 'doc', width: 20 },
      { header: 'Requester', key: 'req', width: 20 },
      { header: 'Division', key: 'div', width: 15 },
      { header: 'Part No.', key: 'part', width: 25 },
      { header: 'Item No.', key: 'item', width: 20 },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'Spec', key: 'spec', width: 25 },
      { header: 'Process', key: 'process', width: 15 },
      { header: 'Fac', key: 'fac', width: 10 },
      { header: 'MC Type', key: 'mctype', width: 15 },
      { header: 'Mat Lot', key: 'mat', width: 20 },
      { header: 'PH Stock Loc', key: 'stockloc', width: 20 },
      { header: 'On Hand', key: 'onhand', width: 15 },
      { header: 'Req QTY', key: 'reqqty', width: 15 },
      { header: 'QTY', key: 'qty', width: 15 },
      { header: 'MC No.', key: 'mcno', width: 10 },
      { header: 'Req Date', key: 'reqdate', width: 15 },
      { header: 'Due Date', key: 'duedate', width: 15 },
      { header: 'Case', key: 'case', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Phone Number', key: 'phone', width: 15 },
      { header: 'Remark', key: 'remark', width: 25 }
    ];
    worksheet.columns = columns;

    selectedItems.forEach((item, index) => {
      worksheet.addRow({
        no: index + 1,
        doc: item.DocNo || '',
        req: item.Requester || '',
        div: item.Division || '',
        part: item.PartNo || '',
        item: item.ItemNo || '',
        name: item.ItemName || '',
        spec: item.SPEC || '',
        process: item.Process || '',
        fac: item.Fac || '',
        mctype: item.MCType || '',
        mat: item.MatLot || '',
        stockloc: item.MAIN_LOCATION || '',
        onhand: item.STOCK_ON_HAND ?? item.ON_HAND ?? '',
        reqqty: item.Req_QTY || '',
        qty: item.QTY || '',
        mcno: item.MCQTY || '',
        reqdate: item.DateTime_Record ? new Date(item.DateTime_Record).toLocaleDateString('en-GB') : '',
        duedate: item.DueDate ? new Date(item.DueDate).toLocaleDateString('en-GB') : '',
        case: item.CASE || '',
        status: item.Status || '',
        phone: item.PhoneNo || '',
        remark: item.Remark || ''
      });
    });

    // Style Header (Yellow Background, Center, Bold)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // Yellow
      };
      cell.font = { bold: true };
      // Adding border to header just in case it looks better
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    // Style All Cells (Center Alignment)
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (rowNumber > 1) { // Apply border to data cells too
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
          };
        }
      });
    });

    workbook.xlsx.writeBuffer().then((buffer: ArrayBuffer) => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  deleteItem(id: string) {
    Swal.fire({
      title: 'Do you want to delete',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'No',
      customClass: { confirmButton: 'btn btn-success me-3', cancelButton: 'btn btn-danger' },
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        this.DetailPurchase.deleteRequest(Number(id)).subscribe({
          next: () => {
            this.request = this.request.filter(item => item.ID_Request !== id);
            this.updatePagination();
            Swal.fire({ title: 'Delete Success!', icon: 'success' });
          },
          error: err => Swal.fire({ title: 'เกิดข้อผิดพลาดในการลบ', icon: 'error' })
        });
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        Swal.fire({ title: 'Cancel Delete', icon: 'info' });
      }
    });
  }

  onFilter(resetPage: boolean = true) {
    // Always compute from current source arrays (not cached)
    const source = this.getDeduplicatedSource();

    if (resetPage) {
      // Reset selection when searching for a new item
      source.forEach(item => item.Selection = false);
      this.selectAllChecked = false;
    }

    this.request = source.filter(item => {
      const status = (item.Status ?? '').toLowerCase().trim();

      // กรองเฉพาะรายการที่ตัดไปแล้ว (Status=Complete) หรือส่งไปหน้า AS400 แล้ว ออกจากหน้า Request List
      // ข้อมูลที่ตัดแล้วจะไปโผล่ที่หน้า ISSUE AS400 แทน ไม่ต้องมาโชว์หน้านี้ซ้ำ
      const as400Status = (item.AS400STATUS ?? '').toLowerCase().trim();
      const isCompletedItem = status === 'complete' || status === 'completetoexcel' || status === 'completeas400';
      const isSentToAS400 = as400Status === 'done' || as400Status === 'success' || as400Status === 'pending' || as400Status === 'processing' || as400Status === 'fail' || as400Status === 'failed';

      if (isCompletedItem || isSentToAS400) return false;

      // Hold Filter: ซ่อนสถานะ Hold จากหน้าหลัก (ถ้าไม่ได้เลือก showHoldOnly)
      if (this.showHoldOnly) {
        if (status !== 'hold') return false;
      } else {
        if (status === 'hold') return false;
      }

      // โชว์ข้อมูลแค่ย้อนหลัง 1 เดือนพอ (ข้อมูลเดือนเก่าๆ ซ่อนหน้าเว็บแต่เก็บไว้ใน DB)
      if (!this.reqDateFrom && !this.reqDateTo) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        oneMonthAgo.setHours(0, 0, 0, 0);

        const rDate = item._parsedRequestDate || (item.DateTime_Record ? new Date(item.DateTime_Record) : null);
        if (rDate && rDate.getTime() < oneMonthAgo.getTime()) {
          return false;
        }
      }

      // Mock Mode Filter
      if (this.isMockMode && !item.isMockTest) return false;
      if (!this.isMockMode && item.isMockTest) return false;

      const matchStatus = !this.Status_?.length || (status && status.includes(this.Status_.toLowerCase()));

      const matchDivision = !this.Division_?.length || item.Division === this.Division_;
      const matchProcess = !this.Process_?.length || item.Process === this.Process_;
      const matchCase = !this.Case_?.length || item.CASE === this.Case_;

      const matchTooling = true;

      const requestDate = item._parsedRequestDate;

      // --- Req Date Range Filter ---
      let matchReqDate = true;
      if (this.reqDateFrom || this.reqDateTo) {
        if (requestDate) {
          const rDate = new Date(requestDate);
          rDate.setHours(0, 0, 0, 0);

          if (this.reqDateFrom) {
            const fromDate = new Date(this.reqDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (rDate.getTime() < fromDate.getTime()) matchReqDate = false;
          }
          if (this.reqDateTo && matchReqDate) {
            const toDate = new Date(this.reqDateTo);
            toDate.setHours(0, 0, 0, 0);
            if (rDate.getTime() > toDate.getTime()) matchReqDate = false;
          }
        } else {
          matchReqDate = false;
        }
      }

      // --- New Filters ---
      const matchMRNo = !this.MRNo_?.length || (item.MR_No && String(item.MR_No).toLowerCase().includes(this.MRNo_.toLowerCase()));
      const matchMCType = !this.MCType_?.length || (item.MCType && String(item.MCType).toLowerCase().includes(this.MCType_.toLowerCase()));
      const matchItemNo = !this.ItemNoFilter_?.length || (
        (item.Req_ItemNo && String(item.Req_ItemNo).toLowerCase().includes(this.ItemNoFilter_.toLowerCase())) ||
        (item.ItemNo && String(item.ItemNo).toLowerCase().includes(this.ItemNoFilter_.toLowerCase()))
      );
      const matchPartNo = !this.PartNo_?.length || (
        (item.Req_PartNo && String(item.Req_PartNo).toLowerCase().includes(this.PartNo_.toLowerCase())) ||
        (item.PartNo && String(item.PartNo).toLowerCase().includes(this.PartNo_.toLowerCase()))
      );
      const matchPHStockLoc = !this.PHStockLoc_?.length || (item.MAIN_LOCATION && String(item.MAIN_LOCATION).toLowerCase().includes(this.PHStockLoc_.toLowerCase()));
      const matchFac = !this.Fac_?.length || String(item.Fac) === String(this.Fac_);

      // --- For Production Filters ---
      const matchMfgOrderNo = !this.MfgOrderNo_?.length || (item.MFGOrderNo && String(item.MFGOrderNo).toLowerCase().includes(this.MfgOrderNo_.toLowerCase()));
      const matchDocumentNo = !this.DocumentNo_?.length || (item.DocNo && String(item.DocNo).toLowerCase().includes(this.DocumentNo_.toLowerCase()));
      const matchMCNo = !this.MCNo_?.length || (
        (item.MCQTY && String(item.MCQTY).toLowerCase().includes(this.MCNo_.toLowerCase())) ||
        (item.MCNo && String(item.MCNo).toLowerCase().includes(this.MCNo_.toLowerCase()))
      );
      const matchItemName = !this.ItemName_?.length || (
        (item.Req_ItemName && String(item.Req_ItemName).toLowerCase().includes(this.ItemName_.toLowerCase())) ||
        (item.ItemName && String(item.ItemName).toLowerCase().includes(this.ItemName_.toLowerCase()))
      );
      const matchSpec = !this.Spec_?.length || (
        (item.Req_SPEC && String(item.Req_SPEC).toLowerCase().includes(this.Spec_.toLowerCase())) ||
        (item.SPEC && String(item.SPEC).toLowerCase().includes(this.Spec_.toLowerCase()))
      );
      const matchReqQty = !this.ReqQty_?.length || String(item.Req_QTY) === String(this.ReqQty_);
      const matchTotalQty = !this.TotalQty_?.length || String(item.Total) === String(this.TotalQty_);
      const matchPhone = !this.Phone_?.length || (
        (item.PhoneNo && String(item.PhoneNo).toLowerCase().includes(this.Phone_.toLowerCase())) ||
        (item.Phone && String(item.Phone).toLowerCase().includes(this.Phone_.toLowerCase()))
      );

      // --- Remark Filter ---
      let matchRemark = true;
      if (this.Remark_?.length) {
        const filterVal = this.Remark_.toLowerCase();
        const itemRemark = (item.Remark || '').toLowerCase();
        if (filterVal === 'shortage') {
          matchRemark = this.isWaitRemark(itemRemark);
        } else {
          matchRemark = itemRemark.includes(filterVal);
        }
      }

      // --- Due Date Filter ---
      let matchDueDate = true;
      if (this.DueDate_?.length) {
        const itemEffectiveDue = this.getEffectiveDueDate(item);
        if (itemEffectiveDue !== this.DueDate_) matchDueDate = false;
      } else if (this.dueDateFrom || this.dueDateTo) {
        if (item.DueDate) {
          const itemDueDate = new Date(item.DueDate);
          itemDueDate.setHours(0, 0, 0, 0);

          if (this.dueDateFrom) {
            const fromDate = new Date(this.dueDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (itemDueDate.getTime() < fromDate.getTime()) matchDueDate = false;
          }
          if (this.dueDateTo && matchDueDate) {
            const toDate = new Date(this.dueDateTo);
            toDate.setHours(0, 0, 0, 0);
            if (itemDueDate.getTime() > toDate.getTime()) matchDueDate = false;
          }
        } else {
          matchDueDate = false;
        }
      }

      const matchRequester = !this.Requester_?.length || item.Requester === this.Requester_;

      return matchStatus && matchDivision && matchProcess && matchCase && matchFac && matchReqDate && matchTooling && matchMRNo && matchMCType && matchItemNo && matchDueDate && matchPartNo && matchRequester && matchPHStockLoc && matchMfgOrderNo && matchDocumentNo && matchMCNo && matchItemName && matchSpec && matchReqQty && matchTotalQty && matchPhone && matchRemark;
    });

    console.warn(`[DEBUG onFilter] Division_="${this.Division_}" showCompleted=${this.showCompleted} | source=${source.length} → filtered=${this.request.length}`);

    this.rebuildDropdownLists(this.request);

    if (resetPage) {
      this.currentPage = 1;
    }
    this.updatePagination();
    this.cdr.markForCheck(); // Ensure UI updates, especially for Show Completed table
  }

  onSort(key: string) {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = true;
    }

    this.request.sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      if (['ReqDate', 'DueDate', 'DateTime_Record'].includes(key)) {
        const parseDate = (val: any) => {
          if (!val) return 0;
          if (typeof val === 'string') {
            const parts = val.includes('-') ? val.split('-') : val.split('/');
            if (parts.length === 3) {
              if (parts[0].length === 4) { return new Date(val).getTime(); }
              else { const [d, m, y] = parts.map(Number); return new Date(y, m - 1, d).getTime(); }
            }
          }
          if (val instanceof Date) return val.getTime();
          const t = new Date(val).getTime();
          return isNaN(t) ? 0 : t;
        };
        const dateA = parseDate(valA);
        const dateB = parseDate(valB);
        return this.sortAsc ? dateA - dateB : dateB - dateA;
      }

      if (!isNaN(valA) && !isNaN(valB)) {
        return this.sortAsc ? valA - valB : valB - valA;
      }

      return this.sortAsc
        ? String(valA ?? '').localeCompare(String(valB ?? ''))
        : String(valB ?? '').localeCompare(String(valA ?? ''));
    });
    this.updatePagination();
  }

  // Helper for template
  min(a: number, b: number): number {
    return Math.min(a, b);
  }

  clearFilters() {
    this.Process_ = null;
    this.Case_ = null;
    this.Status_ = null;
    this.reqDateFrom = null;
    this.reqDateTo = null;

    // Clear new filters
    this.MRNo_ = null;
    this.DueDateFilter_ = null;
    this.dueDateFrom = null;
    this.dueDateTo = null;
    this.MCType_ = null;
    this.ItemNoFilter_ = null;
    this.PartNo_ = null;
    this.Requester_ = null;
    this.PHStockLoc_ = null;
    this.Remark_ = null;
    this.showHoldOnly = false;

    this.showCompleted = false;

    this.onFilter();
  }

  autoFillAllMissingNames() {
    if (!this.ItemNo || this.ItemNo.length === 0) return;
    let changed = false;
    
    const fillRow = (row: any) => {
      const targetNo = String(row.ItemNo || row.Req_ItemNo || '').trim().toUpperCase();
      if (!targetNo) return;
      const found = this.ItemNo.find((x: any) => String(x.ItemNo || '').trim().toUpperCase() === targetNo);
      if (found) {
        if (!row.ItemName) {
          row.ItemName = found.ItemName;
          row.Req_ItemName = found.ItemName;
          changed = true;
        }
        if (!row.SPEC) {
          row.SPEC = found.SPEC;
          row.Req_SPEC = found.SPEC;
          changed = true;
        }
        // Sync live ON_HAND stock from Master View (View_tb_Master_Purchase_SUM_ALL)
        const liveStock = row.isMockTest ? row.STOCK_ON_HAND : Number(found.ON_HAND ?? found.STOCK_ON_HAND ?? 0);
        if (row.STOCK_ON_HAND !== liveStock) {
          row.STOCK_ON_HAND = liveStock;
          row.ON_HAND = liveStock;
          changed = true;
        }
        if (found.MAIN_LOCATION && (!row.MAIN_LOCATION || row.MAIN_LOCATION === '')) {
          row.MAIN_LOCATION = found.MAIN_LOCATION;
          changed = true;
        }
      } else {
        // If not found in Item Master, its stock must be 0 (except mock items)
        const liveStock = row.isMockTest ? row.STOCK_ON_HAND : 0;
        if (row.STOCK_ON_HAND !== liveStock || row.ON_HAND !== liveStock || (row.MAIN_LOCATION !== '' && !row.isMockTest)) {
          row.STOCK_ON_HAND = liveStock;
          row.ON_HAND = liveStock;
          if (!row.isMockTest) row.MAIN_LOCATION = '';
          changed = true;
        }
      }
    };

    this.allRequests.forEach(fillRow);
    this.allSetupRequests.forEach(fillRow);
    
    if (changed) {
      this.onFilter(false); // Re-filter to apply changes to displayedRequests while keeping current page
      this.cdr.markForCheck();
    }
  }

  isRowValid(item: any): boolean {
    return true;
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
    const activeIds = Object.keys(this.editingIndex).filter(key => this.editingIndex[key] !== null);
    if (activeIds.length > 0) {
      activeIds.forEach(id => this.saveEdit(id));
    }
    this.editingIndex = {}; // Force Rebuild
  }

  private checkAndSendCompletionEmail(updatedItems: any[]) {
    if (!updatedItems || updatedItems.length === 0) return;

    // 1. Mark the updated items as Complete in the local source arrays
    updatedItems.forEach(it => {
      const findAndUpdate = (arr: any[]) => {
        const target = arr.find(r => r.Public_Id === it.Public_Id);
        if (target) target.Status = 'Complete';
      };
      findAndUpdate(this.allRequests);
      findAndUpdate(this.allSetupRequests);
    });

    // 2. Group by DocNo to check if the entire document is finished
    // (Usually items in a bulk confirm or single confirm belong to the same request)
    const docNo = updatedItems[0].DocNo;
    const requester = updatedItems[0].Requester;

    if (docNo) {
      const source = [...this.allRequests, ...this.allSetupRequests];
      const remainingIncomplete = source.filter(it =>
        it.DocNo === docNo &&
        !(it.Status || '').toLowerCase().includes('complete')
      );

      if (remainingIncomplete.length === 0) {
        // Everything for this DocNo is complete! Send email back to PC/Requester
        const actionBy = this.currentUser?.Employee_Name || this.currentUser?.Username;
        const planDate = updatedItems[0].DueDate ? new Date(updatedItems[0].DueDate).toISOString().split('T')[0] : '-';
        const comment = `All items in request ${docNo} have been completed and confirmed.`;

        // Send to PC role and the specific requester name
        this.pcPlanService.sendEmail(null, actionBy, planDate, comment, ['PC'], [requester], 'Complete').subscribe({
          next: () => console.log(`Completion email sent for Doc: ${docNo} to ${requester} and PC role`),
          error: (err) => console.error('Failed to send completion email', err)
        });
      }
    }
  }
}
