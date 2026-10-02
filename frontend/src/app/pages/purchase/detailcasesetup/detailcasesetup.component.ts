import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID, NgZone, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { DetailPurchaseRequestlistService } from '../../../core/services/DetailPurchaseRequestlist.service';
import { SidebarPurchaseComponent } from '../../../components/sidebar/sidebarPurchase.component';
import { PCPlanService } from '../../../core/services/PCPlan.service';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { Subscription, interval, forkJoin, Observable, of } from 'rxjs'; // Import interval, Subscription and forkJoin
import { PurchaseHistoryservice } from '../../../core/services/PurchaseHistory.service';

@Component({
  selector: 'app-detailcasesetup',
  standalone: true,
  imports: [CommonModule, FormsModule, NgSelectModule, SidebarPurchaseComponent],
  templateUrl: './detailcasesetup.component.html',
  styleUrls: ['./detailcasesetup.component.scss']
})
export class DetailCaseSetupComponent implements OnInit, OnDestroy {
  as400Config: any = { employeeId: '', pcName: '' };
  
  loadAS400Config() {
    this.purchasehistory.getAS400Config().subscribe({
      next: (config: any) => {
        this.as400Config = config;
      },
      error: (err: any) => console.error('Failed to load AS400 Config:', err)
    });
  }


  private refreshSubscription: Subscription = new Subscription(); // To manage the interval subscription

  isMockMode: boolean = false;
  mockCutStatusCache: { [key: string]: string } = {}; // Cache to preserve green/red colors across data reloads

  // Data
  allRequests: any[] = [];
  displayedRequests: any[] = []; // Full filtered list (Pattern A)
  request: any[] = []; // Synced with displayedRequests for compatibility

  // Pivot Arrays for Filters
  divisionList = [
    { label: 'GM', value: '7122' },
    { label: 'PMC', value: '71DZ' }
  ];
  StatusList = [
    { label: 'Wait', value: 'Waiting' },
    { label: 'Complete', value: 'Complete' }
  ];

  RequesterList: any[] = [];
  FacList: any[] = [];
  CaseList: any[] = [];
  ModelList: any[] = [];
  ProcessList: any[] = [];
  MCTypeList: any[] = [];
  DocNoList: any[] = [];
  ToolingList = [
    { label: 'Cutting Tool', value: 'Cutting Tool' },
    { label: 'Setup Tool', value: 'Setup Tool' }
  ];
  PartNoList: any[] = [];
  ItemNoList: any[] = [];
  MRNoList: any[] = [];
  PHStockLocList: any[] = [];

  // New For Production Filter Lists
  MfgOrderNoList: any[] = [];
  MCNoList: any[] = [];
  ItemNameList: any[] = [];
  SpecList: any[] = [];
  ReqQtyList: any[] = [];
  PhoneList: any[] = [];


  // Selected Filters
  Division_: string | null = null;
  Status_: string | null = null;
  Requester_: string | null = null;
  Fac_: string | null = null;
  Case_: string | null = null;
  Model_: string | null = null;
  Process_: string | null = null;
  MCType_: string | null = null;
  DocNo_: string | null = null;
  reqDateFrom: string | null = null;
  reqDateTo: string | null = null;
  DueDateFilter_: string | null = null;
  dueDateFrom: string | null = null;
  dueDateTo: string | null = null;

  PartNo_: string | null = null;
  ItemNoFilter_: string | null = null;
  Tooling_: string | null = 'Setup Tool';
  MRNo_: string | null = null;
  PHStockLoc_: string | null = null;
  MfgOrderNo_: string | null = null;
  MCNo_: string | null = null;
  ItemName_: string | null = null;
  Spec_: string | null = null;
  ReqQty_: string | null = null;
  Phone_: string | null = null;
  Remark_: string | null = null;
  DueDate_: string | null = null;

  RemarkList: any[] = [];
  DueDateList: any[] = [];


  // Pagination
  currentPage: number = 1;
  pageSize: number = 20;
  totalPages: number = 1;
  pages: number[] = [];
  showCompleted: boolean = false;

  // Sorting
  sortKey: string = '';
  sortAsc: boolean = true;
  selectAllChecked: boolean = false;
  editingIndex: { [key: string]: number | null } = {};
  highlightedRow: number | null = null;
  isCompleting = false;

  constructor(
    private purchasehistory: PurchaseHistoryservice,
    private detailService: DetailPurchaseRequestlistService,
    private pcPlanService: PCPlanService,
    private cdRef: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object,
    private zone: NgZone
  ) { }

  ngOnInit() { 
    this.loadAS400Config();
    if (!isPlatformBrowser(this.platformId)) return;

    this.fetchData();
    // Auto-refresh every 30 seconds
    this.zone.runOutsideAngular(() => {
      this.refreshSubscription = interval(30000).subscribe(() => {
        // Only fetch if no unsaved changes (editing, selected, or dirty)
        if (!this.hasUnsavedChanges()) {
          this.zone.run(() => {
            this.fetchData(true); // Pass true to indicate background refresh
          });
        }
      });
    });
  }

  ngOnDestroy() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  fetchData(isBackgroundRefresh = false) {
    // ... (existing logic) -> modify fetchData slightly to not show loading spinner if background refresh

    if (!isBackgroundRefresh) {
      // Only show full loading state on initial load or manual refresh
      // You might want to set a loading flag here if you had one, but currently we just fetch
      }

    this.detailService.Detail_CaseSetup().subscribe({
      next: (res: any) => { // Explicitly typed as any
        if (!Array.isArray(res)) {
          this.allRequests = [];
          this.displayedRequests = [];
          this.request = [];
          this.updatePagination();
          return;
        }
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

        const validRes = res.filter((item: any) => isWithinOneMonth(item.DateTime_Record));

        this.allRequests = validRes.map(item => {
          let computedAlertDate = null;
          if (item.DueDate) {
            const date = new Date(item.DueDate);
            date.setDate(date.getDate() - 2);
            computedAlertDate = date.toISOString();
          }

          return {
            ...item,
            Alert_DueDate: item.Alert_DueDate || computedAlertDate,
            ID_Request: item.ID_Request ?? item.OriginalID,
            Public_Id: item.Public_Id || item.ID_Request || item.OriginalID,
            Selection: false,
            ToolingType: item.ToolingType || 'SetupTool',
            isMockTest: !!item.isMockTest,
            mockCutStatus: this.mockCutStatusCache[item.Public_Id || item.ID_Request || item.OriginalID] || null,
            QTY: item.QTY ?? item.Req_QTY,
            // Store original state for Inhibition check
            _originalItemNo: item.ItemNo,
            _originalSPEC: item.SPEC,
            _originalQTY: item.QTY ?? item.Req_QTY,
            Req_ItemName: item.ItemName,
            Req_SPEC: item.SPEC,
            Req_ItemNo: item.ItemNo,
            TableType: (item.ToolingType === 'CuttingTool') ? 'Cutting' : 'Setup'
          };
        });

        // Sort by Req Date (DateTime_Record) ASC, then Part No (PartNo) ASC
        this.allRequests.sort((a, b) => {
          const dateA = a.DateTime_Record ? new Date(a.DateTime_Record).getTime() : 0;
          const dateB = b.DateTime_Record ? new Date(b.DateTime_Record).getTime() : 0;
          if (dateA !== dateB) {
            return dateA - dateB;
          }
          const partA = String(a.PartNo || '').toLowerCase();
          const partB = String(b.PartNo || '').toLowerCase();
          return partA.localeCompare(partB);
        });

        this.filteredListToDisplay(); // Initial Copy
        this.populateDropdowns();
        this.onFilter(false);
        // Load item master AFTER main data is ready (not needed for initial display)
        this.get_ItemNo();
        this.cdRef.markForCheck();
      },
      error: (err: any) => {
        console.error('Error fetching Case Setup data:', err);
        }
    });
  }

  // Helper to sync lists
  filteredListToDisplay() {
    this.displayedRequests = [...this.allRequests];
    this.request = [...this.displayedRequests];
  }

  populateDropdowns(source: any[] = this.allRequests) {
    const sets = {
      Requester: new Set<string>(),
      Fac: new Set<string>(),
      CASE: new Set<string>(),
      Model: new Set<string>(),
      Process: new Set<string>(),
      MCType: new Set<string>(),
      DocNo: new Set<string>(),
      PartNo: new Set<string>(),
      ItemNo: new Set<string>(),
      MR_No: new Set<string>(),
      PHStockLoc: new Set<string>(),
      MfgOrderNo: new Set<string>(),
      MCNo: new Set<string>(),
      ItemName: new Set<string>(),
      Spec: new Set<string>(),
      ReqQty: new Set<string>(),
      Phone: new Set<string>(),
      DueDate: new Set<string>(),
      Remark: new Set<string>()
    };

    source.forEach(item => {
      if (item.Requester && String(item.Requester).trim().toLowerCase() !== 'aon') sets.Requester.add(item.Requester);
      if (item.Fac) sets.Fac.add(item.Fac);
      if (item.CASE) sets.CASE.add(item.CASE);
      if (item.Model) sets.Model.add(item.Model);
      if (item.Process) sets.Process.add(item.Process);
      if (item.MCType) sets.MCType.add(item.MCType);
      if (item.DocNo) sets.DocNo.add(item.DocNo);
      if (item.PartNo) sets.PartNo.add(item.PartNo);
      if (item.ItemNo) sets.ItemNo.add(item.ItemNo);
      if (item.MR_No) sets.MR_No.add(item.MR_No);
      if (item.MAIN_LOCATION) sets.PHStockLoc.add(item.MAIN_LOCATION);
      if (item.MFGOrderNo) sets.MfgOrderNo.add(item.MFGOrderNo);
      if (item.MCQTY || item.MCNo) sets.MCNo.add(item.MCQTY || item.MCNo);
      if (item.Req_ItemName || item.ItemName) sets.ItemName.add(item.Req_ItemName || item.ItemName);
      if (item.Req_SPEC || item.SPEC) sets.Spec.add(item.Req_SPEC || item.SPEC);
      if (item.Req_QTY != null) sets.ReqQty.add(String(item.Req_QTY));
      if (item.PhoneNo || item.Phone) sets.Phone.add(item.PhoneNo || item.Phone);
      if (item.Remark) sets.Remark.add(item.Remark);
      
      const effectiveDue = this.getEffectiveDueDate(item);
      if (effectiveDue && effectiveDue !== '-') {
        sets.DueDate.add(effectiveDue);
      }
    });

    const toSortedOptions = (set: Set<string>) => Array.from(set).sort().map(x => ({ label: x, value: x }));

    this.RequesterList = toSortedOptions(sets.Requester);
    this.FacList = toSortedOptions(sets.Fac);
    this.CaseList = toSortedOptions(sets.CASE);
    this.ModelList = toSortedOptions(sets.Model);
    this.ProcessList = toSortedOptions(sets.Process);
    this.MCTypeList = toSortedOptions(sets.MCType);
    this.DocNoList = toSortedOptions(sets.DocNo);
    this.PartNoList = toSortedOptions(sets.PartNo);
    this.ItemNoList = toSortedOptions(sets.ItemNo);
    this.MRNoList = toSortedOptions(sets.MR_No);
    this.PHStockLocList = toSortedOptions(sets.PHStockLoc);
    this.MfgOrderNoList = toSortedOptions(sets.MfgOrderNo);
    this.MCNoList = toSortedOptions(sets.MCNo);
    this.ItemNameList = toSortedOptions(sets.ItemName);
    this.SpecList = toSortedOptions(sets.Spec);
    this.ReqQtyList = Array.from(sets.ReqQty).sort((a, b) => Number(a) - Number(b)).map(x => ({ label: x, value: x }));
    this.PhoneList = toSortedOptions(sets.Phone);
    this.DueDateList = toSortedOptions(sets.DueDate);
    this.RemarkList = toSortedOptions(sets.Remark);
  }

  onFilter(resetPage: boolean = true) {
    if (resetPage) {
      // Reset selection when searching for a new item
      this.allRequests.forEach(item => item.Selection = false);
      this.selectAllChecked = false;
    }

    this.displayedRequests = this.allRequests.filter(req => {
      // Mock Mode Filter
      if (this.isMockMode && !req.isMockTest) return false;
      if (!this.isMockMode && req.isMockTest) return false;

      const status = (req.Status ?? '').toLowerCase().trim();
      const as400Status = (req.AS400STATUS ?? '').toLowerCase().trim();

      // Auto-Cleanup: Hide 'Cancelled' items older than 7 days
      if (status === 'cancelled') {
        const cancelDateStr = req.DateComplete || req.DateTime_Record;
        if (cancelDateStr) {
          const diffInMs = new Date().getTime() - new Date(cancelDateStr).getTime();
          const diffInDays = diffInMs / (1000 * 3600 * 24);
          if (diffInDays > 7) {
            return false;
          }
        }
      }

      const matchDiv = !this.Division_ || req.Division === this.Division_;

      // ซ่อนเฉพาะ Status=Complete เท่านั้น
      const isCompletedItem = status === 'complete' || status === 'completetoexcel';

      if (!this.showCompleted && isCompletedItem) {
        return false;
      }
      
      let matchCompleted = true;
      if (this.showCompleted) {
        matchCompleted = isCompletedItem;
      }

      const matchStatus = !this.Status_ || (status && status.includes(this.Status_.toLowerCase()));
      const matchRequester = !this.Requester_ || req.Requester === this.Requester_;
      const matchFac = !this.Fac_ || req.Fac == this.Fac_;
      const matchCase = !this.Case_ || req.CASE === this.Case_;
      const matchModel = !this.Model_ || req.Model === this.Model_;
      const matchPartNo = !this.PartNo_ || req.PartNo === this.PartNo_;
      const matchProcess = !this.Process_ || req.Process === this.Process_;
      const matchMCType = !this.MCType_ || req.MCType === this.MCType_;
      const matchDocNo = !this.DocNo_ || (req.DocNo && req.DocNo.toLowerCase().includes(this.DocNo_.toLowerCase()));
      const matchMRNo = !this.MRNo_ || (req.MR_No && req.MR_No.toLowerCase().includes(this.MRNo_.toLowerCase()));
      const matchItemNo = !this.ItemNoFilter_ || (req.ItemNo && req.ItemNo.toLowerCase().includes(this.ItemNoFilter_.toLowerCase()));

      const matchMfgOrderNo = !this.MfgOrderNo_ || (req.MFGOrderNo && req.MFGOrderNo.toLowerCase().includes(this.MfgOrderNo_.toLowerCase()));
      const matchMCNo = !this.MCNo_ || ((req.MCQTY && String(req.MCQTY).toLowerCase().includes(this.MCNo_.toLowerCase())) || (req.MCNo && String(req.MCNo).toLowerCase().includes(this.MCNo_.toLowerCase())));
      const matchItemName = !this.ItemName_ || ((req.Req_ItemName && req.Req_ItemName.toLowerCase().includes(this.ItemName_.toLowerCase())) || (req.ItemName && req.ItemName.toLowerCase().includes(this.ItemName_.toLowerCase())));
      const matchSpec = !this.Spec_ || ((req.Req_SPEC && req.Req_SPEC.toLowerCase().includes(this.Spec_.toLowerCase())) || (req.SPEC && req.SPEC.toLowerCase().includes(this.Spec_.toLowerCase())));
      const matchReqQty = !this.ReqQty_ || String(req.Req_QTY) === String(this.ReqQty_);
      const matchPhone = !this.Phone_ || ((req.PhoneNo && String(req.PhoneNo).toLowerCase().includes(this.Phone_.toLowerCase())) || (req.Phone && String(req.Phone).toLowerCase().includes(this.Phone_.toLowerCase())));

      let matchDate = true;
      if (this.reqDateFrom || this.reqDateTo) {
        if (req.DateTime_Record) {
          const recDate = new Date(req.DateTime_Record);
          recDate.setHours(0, 0, 0, 0);

          if (this.reqDateFrom) {
            const fromDate = new Date(this.reqDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (recDate.getTime() < fromDate.getTime()) matchDate = false;
          }
          if (this.reqDateTo && matchDate) {
            const toDate = new Date(this.reqDateTo);
            toDate.setHours(0, 0, 0, 0);
            if (recDate.getTime() > toDate.getTime()) matchDate = false;
          }
        } else {
          matchDate = false;
        }
      }

      let matchDueDate = true;
      if (this.DueDate_?.length) {
        const itemEffectiveDue = this.getEffectiveDueDate(req);
        if (itemEffectiveDue !== this.DueDate_) matchDueDate = false;
      }

      const matchPHStockLoc = !this.PHStockLoc_ || (req.MAIN_LOCATION && req.MAIN_LOCATION.toLowerCase().includes(this.PHStockLoc_.toLowerCase()));
      
      let matchRemark = true;
      if (this.Remark_?.length) {
        const filterVal = this.Remark_.toLowerCase();
        const itemRemark = (req.Remark || '').toLowerCase();
        if (filterVal === 'shortage') {
          matchRemark = this.isWaitRemark(itemRemark);
        } else {
          matchRemark = itemRemark.includes(filterVal);
        }
      }

      return matchDiv && matchCompleted && matchStatus && matchRequester && matchFac && matchCase && matchModel && matchPartNo && matchProcess && matchMCType && matchDocNo && matchMRNo && matchItemNo && matchDate && matchDueDate && matchPHStockLoc && matchMfgOrderNo && matchMCNo && matchItemName && matchSpec && matchReqQty && matchPhone && matchRemark;
    });

    this.request = this.displayedRequests;
    this.populateDropdowns(this.displayedRequests);

    if (resetPage) {
      this.currentPage = 1;
    }
    this.updatePagination();
    this.cdRef.markForCheck(); // Ensure UI updates
  }

  clearFilters() {
    this.Status_ = null;
    this.Requester_ = null;
    this.Fac_ = null;
    this.Remark_ = null;
    this.Case_ = null;
    this.Model_ = null;
    this.PartNo_ = null;
    this.Process_ = null;
    this.MCType_ = null;
    this.DocNo_ = null;
    this.reqDateFrom = null;
    this.reqDateTo = null;
    this.DueDateFilter_ = null;
    this.DueDate_ = null;
    this.dueDateFrom = null;
    this.dueDateTo = null;
    this.MRNo_ = null;
    this.ItemNoFilter_ = null;
    this.PHStockLoc_ = null;
    this.MfgOrderNo_ = null;
    this.MCNo_ = null;
    this.ItemName_ = null;
    this.Spec_ = null;
    this.ReqQty_ = null;
    this.Phone_ = null;
    this.showCompleted = false;
    this.onFilter();
  }

  isLoading: boolean = false;

  onDivisionChange() {
    this.isLoading = true;
    setTimeout(() => {
      this.onFilter();
      this.isLoading = false;
    }, 3000);
  }

  toggleMockMode() { 
    this.isMockMode = !this.isMockMode; 
    this.isLoading = true; 
    setTimeout(() => { 
      this.onFilter(); 
      this.isLoading = false; 
    }, 3000); 
  }

  onSort(key: string) {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = true;
    }

    this.displayedRequests.sort((a, b) => {
      const valA = a[key];
      const valB = b[key];

      if (['DateTime_Record', 'StartTime', 'DueDate', 'Alert_DueDate'].includes(key)) {
        const dateA = valA ? new Date(valA).getTime() : 0;
        const dateB = valB ? new Date(valB).getTime() : 0;
        return this.sortAsc ? dateA - dateB : dateB - dateA;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return this.sortAsc ? valA - valB : valB - valA;
      }

      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();

      if (strA < strB) return this.sortAsc ? -1 : 1;
      if (strA > strB) return this.sortAsc ? 1 : -1;
      return 0;
    });

    // Update synced list order
    this.request = [...this.displayedRequests];
    this.updatePagination();
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

    // 1. มี Due Date ดึงมาใช้ก่อน
    if (item.DueDate) {
      const formatted = this.formatYYMMDD(item.DueDate);
      if (formatted) return formatted;
    }

    // 2. อันไหนไม่มี Due Date จะอ้างอิงจากของ DocNo (6 ตัวท้าย)
    const docStr = String(item.DocNo || '').trim();
    if (docStr.length >= 6) {
      const lastSix = docStr.slice(-6);
      if (/^\d{6}$/.test(lastSix)) {
        return lastSix;
      }
    }

    // 3. อันไหนไม่มี DocNo (ไม่มีเลขวันที่) จะอ้างอิงวันสั่ง + 7 วัน
    if (item.DateTime_Record) {
      const reqDate = new Date(item.DateTime_Record);
      if (!isNaN(reqDate.getTime())) {
        reqDate.setDate(reqDate.getDate() + 7);
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

  updatePagination() {
    this.totalPages = Math.ceil(this.displayedRequests.length / this.pageSize) || 1;

    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    let startPage = Math.max(1, this.currentPage - 2);
    let endPage = Math.min(this.totalPages, startPage + 4);

    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    this.pages = [];
    for (let i = startPage; i <= endPage; i++) {
      this.pages.push(i);
    }
    this.updateSelectAllCheckedState();
    this.cdRef.markForCheck();
  }

  // Computed property for slice (Pattern A)
  get paginatedItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.displayedRequests.slice(start, start + this.pageSize);
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      // Reset selection when switching pages
      this.request.forEach(r => r.Selection = false);
      this.selectAllChecked = false;

      this.currentPage = page;
      this.updatePagination();
      this.cdRef.markForCheck();
    }
  }

  hasUnsavedChanges(): boolean {
    // 1. Any row in edit mode?
    if (Object.keys(this.editingIndex).length > 0) return true;

    // 2. Any row selected?
    if (this.request.some(r => r.Selection)) return true;

    // 3. Any row dirty?
    const isDirty = this.request.some(it => {
      return it.ItemNo !== it._originalItemNo ||
        it.SPEC !== it._originalSPEC ||
        it.QTY !== it._originalQTY;
    });

    return isDirty;
  }

  updateSelectAllCheckedState() {
    const paginated = this.paginatedItems;
    if (paginated.length === 0) {
      this.selectAllChecked = false;
    } else {
      this.selectAllChecked = paginated.every(item => item.Selection);
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
          this.paginatedItems.forEach(item => item.Selection = true);
          this.selectAllChecked = true;
          Swal.fire({ icon: 'success', title: 'Selected Current Page', text: `All items on page ${this.currentPage} selected.`, timer: 1200, showConfirmButton: false });
        } else {
          // User cancelled
          this.selectAllChecked = false;
          this.request.forEach(item => item.Selection = false);
        }
        this.cdRef.markForCheck();
      });
    } else {
      // Uncheck all
      this.request.forEach(item => item.Selection = false);
      this.selectAllChecked = false;
      this.cdRef.markForCheck();
    }
  }

  trackByRequestId(index: number, item: any): string {
    return item.Public_Id || item.ID_Request;
  }

  min(a: number, b: number): number {
    return Math.min(a, b);
  }

  isViewer(): boolean {
    return false;
  }

  exportexcel() {
    if (!isPlatformBrowser(this.platformId)) return;

    const selectedItems = this.request.filter(item => item.Selection);

    if (selectedItems.length === 0) {
      Swal.fire({ icon: 'warning', title: 'No rows selected', text: 'Please select at least one row to export.' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('CaseSetup_Export');

    const columns = [
      { header: 'No.', key: 'no', width: 10 },
      { header: 'Document', key: 'doc', width: 20 },
      { header: 'Requester', key: 'req', width: 20 },
      { header: 'Division', key: 'div', width: 15 },
      { header: 'Part No.', key: 'part', width: 25 },
      { header: 'Status To PH', key: 'statustoph', width: 15 },
      { header: 'Item No.', key: 'item', width: 20 },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'Spec', key: 'spec', width: 25 },
      { header: 'Process', key: 'process', width: 15 },
      { header: 'MC Type', key: 'mctype', width: 15 },
      { header: 'Fac', key: 'fac', width: 10 },
      { header: 'Mat Lot', key: 'mat', width: 20 },
      { header: 'PH Stock Loc', key: 'stockloc', width: 20 },
      { header: 'On Hand', key: 'onhand', width: 15 },
      { header: 'QTY', key: 'qty', width: 15 },
      { header: 'MC No.', key: 'mcno', width: 10 },
      { header: 'Req Date', key: 'reqdate', width: 15 },
      { header: 'Case', key: 'case', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Phone Number', key: 'phone', width: 15 },
      { header: 'Due Date', key: 'duedate', width: 15 },
      { header: 'After Due Date', key: 'alertduedate', width: 15 },
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
        statustoph: item.Status_To_PH || '',
        item: item.ItemNo || '',
        name: item.ItemName || '',
        spec: item.SPEC || '',
        process: item.Process || '',
        mctype: item.MCType || '',
        fac: item.Fac || '',
        mat: item.MatLot || '',
        stockloc: item.MAIN_LOCATION || '',
        onhand: item.STOCK_ON_HAND ?? item.ON_HAND ?? '',
        qty: item.QTY || '',
        mcno: item.MCNo || '',
        reqdate: item.DateTime_Record ? new Date(item.DateTime_Record).toLocaleDateString('en-GB') : '',
        case: item.CASE || '',
        status: item.Status || '',
        phone: item.PhoneNo || '',
        duedate: item.DueDate ? new Date(item.DueDate).toLocaleDateString('en-GB') : '',
        alertduedate: item.Alert_DueDate ? new Date(item.Alert_DueDate).toLocaleDateString('en-GB') : '',
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
      a.download = 'CaseSetup_Export.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  deleteRow(rowIndex: number) {
    const item = this.paginatedItems[rowIndex];

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
          const id = item.Public_Id || item.ID_Request;
          this.removeFromLists(id);
          delete this.editingIndex[id];
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
          this.detailService.deleteRequest(item.ID_Request).subscribe({
            next: () => {
              const id = item.Public_Id || item.ID_Request;
              this.removeFromLists(id);
              delete this.editingIndex[id];
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
        this.cdRef.markForCheck();

        // Separate new rows (local only) and database rows (need API calls)
        const localRows = selectedItems.filter(it => it.isNew);
        const dbRows = selectedItems.filter(it => !it.isNew);

        // Delete local rows immediately
        localRows.forEach(item => {
          const id = item.Public_Id || item.ID_Request;
          this.removeFromLists(id);
          delete this.editingIndex[id];
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
          this.cdRef.markForCheck();
          return;
        }

        // Run deletion calls in parallel using forkJoin
        const deleteObservables = dbRows.map(it => this.detailService.deleteRequest(it.ID_Request));

        forkJoin(deleteObservables).subscribe({
          next: () => {
            dbRows.forEach(item => {
              const id = item.Public_Id || item.ID_Request;
              this.removeFromLists(id);
              delete this.editingIndex[id];
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
            this.cdRef.markForCheck();
          },
          error: (err) => {
            this.isDeletingSelected = false;
            Swal.fire({
              icon: 'error',
              title: 'Error / เกิดข้อผิดพลาด',
              text: 'ไม่สามารถลบข้อมูลบางรายการได้ / Some items could not be deleted.'
            });
            this.cdRef.markForCheck();
          }
        });
      }
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

  startEdit(publicId: string, index: number) {
    this.editingIndex = {};
    this.editingIndex[publicId] = index;
    const item = this.request.find(r => r.Public_Id === publicId);
    if (item) {
      this.originalItemState = {
        ItemNo: item.ItemNo,
        QTY: item.QTY,
        MatLot: item.MatLot,
        Remark: item.Remark
      };
    }
    this.cdRef.markForCheck();
    this.scrollToKeepRemarkVisible();
}

  saveEdit(publicId: string, silent: boolean = false) {
    const item = this.request.find(r => (r.Public_Id || r.ID_Request) === publicId)
      || this.allRequests.find(r => (r.Public_Id || r.ID_Request) === publicId);

    if (!item) return;

    this.syncSpecWithItemNo(item).subscribe({
      next: () => {
        const snapshot = { ...item };
        const hasId = item.ID_Request != null || item.Public_Id != null;

        if (!hasId) {
          // Logic for manual insert? (Not yet clear if used)
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
          this.cdRef.markForCheck();

          if (!hasChanges) {
            this.originalItemState = null;
            return;
          }

          if (!item.TableType) {
            item.TableType = (item.Public_Id && String(item.Public_Id).startsWith('S')) || item.ToolingType === 'SetupTool' ? 'Setup' : 'Cutting';
          }

          this.detailService.updateRequest(item).subscribe({
            next: (res) => {
              item.isNew = false;
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
              this.populateDropdowns(this.allRequests);
              this.cdRef.markForCheck();
            },
            error: (err) => {
              Object.assign(item, snapshot);
              // Restore editing state on error so they can try again
              const index = this.request.findIndex(r => (r.Public_Id || r.ID_Request) === publicId);
              if (index > -1) {
                this.editingIndex[publicId] = index;
              }
              alert('เกิดข้อผิดพลาดในการบันทึกแถว');
              this.cdRef.markForCheck();
            }
          });
        }
      }
    });
  }

  confirmItem(item: any) {
    if (!item) return;

    let selectedItems = this.request.filter(it => it.Selection === true);
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
        this.cdRef.markForCheck();

        // Proceed with validation and confirm UI
        selectedItems.forEach(it => {
          if (it.QTY == null || it.QTY === '') it.QTY = it.Req_QTY ?? 0;
        });

        // Frontend zero-stock block removed. Let the backend handle partial cuts.

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
          title: 'Confirm case setup items?',
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
            this.cdRef.markForCheck();

            const updateQtyObservables = selectedItems.map(it =>
              this.detailService.updateRequest(it)
            );

            forkJoin(updateQtyObservables).subscribe({
              next: () => {
                const firstItem = selectedItems[0] || item;
                // Split: ON_HAND > 0 → Complete, ON_HAND = 0 → Hold (same as Request List)
                const completeItems = selectedItems.filter(it => Number(it.QTY) >= Number(it.Req_QTY ?? it.QTY));
                const holdItems = selectedItems.filter(it => Number(it.QTY) > 0 && Number(it.QTY) < Number(it.Req_QTY ?? it.QTY));

                const completeIds = completeItems.map(it => it.Public_Id || it.ID_Request);
                const holdIds = holdItems.map(it => it.Public_Id || it.ID_Request);

                const statusObservables: any[] = [];
                if (completeIds.length > 0) {
                  statusObservables.push(this.detailService.updateStatusToComplete(completeIds, 'Complete', (completeItems[0] || firstItem).TableType));
                }
                if (holdIds.length > 0) {
                  statusObservables.push(this.detailService.updateStatusToComplete(holdIds, 'Hold', (holdItems[0] || firstItem).TableType));
                }

                if (statusObservables.length === 0) {
                  this.isCompleting = false;
                  return;
                }

                forkJoin(statusObservables).subscribe({
                  next: (responses: any[]) => {
                    const res = responses[0]; // First response (Complete batch)
                    if (this.isMockMode) {
                      let hasFailures = false;
                      let allZeroStockItems: any[] = [];

                      if (res?.validIds) {
                        res.validIds.forEach((vid: string) => {
                          this.mockCutStatusCache[vid] = 'SUCCESS';
                          setTimeout(() => {
                            delete this.mockCutStatusCache[vid];
                            this.onFilter();
                            this.cdRef.markForCheck();
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
                        res.zeroStockIds.forEach((vid: string) => {
                          const found = this.allRequests.find((r: any) => r.Public_Id === vid || r.ID_Request === vid);
                          if (found) found.Status = 'Hold';
                          const found2 = this.request.find((r: any) => r.Public_Id === vid || r.ID_Request === vid);
                          if (found2) found2.Status = 'Hold';
                        });
                        if (res?.zeroStockItems) {
                          allZeroStockItems = [...allZeroStockItems, ...res.zeroStockItems];
                        }
                      }

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
                        if (completeItems.length > 0) {
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
                            "ItemNo": req.ItemNo || "", "ItemRevision": "", "Quantity": req.QTY || 0,
                            "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
                            "DOCNo": req.DocNo || "", "TransactionYear": d.getFullYear().toString(),
                            "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
                            "TransactionDay": d.getDate().toString().padStart(2, '0'),
                            "WareHouse": warehouseVal, "StockControl": "", "StockLocation": req.MAIN_LOCATION || req.MAIN_LOCATION_Name || req.Stock_Location || "",
                            "MaterialLot": req.MatLot || "",
                            "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFGOrderNo || "") : (req.PartNo || ""),
                            "Vendor": "", "EmpID": this.as400Config.employeeId || "", "Pcname": this.as400Config.pcName || "",
                            "MCNo6Digit": req.MCNo6Digit || req.MC6Digit || "", "MC_No": req.MC_No || req.MCNo || "",
                            "MCType": req.MCType || "", "Public_Id": req.Public_Id, "isMockTest": false
                          };
                        });
                        this.purchasehistory.exportToAS400(this.Division_!, mappedAS400Data).subscribe({
                          next: (res: any) => {
                            Swal.fire({ icon: 'success', title: 'Confirmed!', text: `${selectedItems.length} item(s) confirmed and Auto-Fired successfully.`, showConfirmButton: false, timer: 1500 });
                          },
                          error: (err: any) => console.error(err)
                        });
                      } else {
                        Swal.fire({ icon: 'success', title: 'Confirmed!', text: `${selectedItems.length} item(s) confirmed successfully.`, showConfirmButton: false, timer: 1500 });
                      }
                    }

                    // Send confirmation email back to PD and PC
                    const actionBy = firstItem.Requester || 'System';
                    let planDate = '-';
                    if (firstItem.DueDate) {
                      try {
                        const d = new Date(firstItem.DueDate);
                        if (!isNaN(d.getTime())) {
                          planDate = d.toISOString().slice(0, 10);
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    }
                    const comment = selectedItems.length > 1
                      ? `Bulk confirmed ${selectedItems.length} items`
                      : (firstItem.Remark || 'Item confirmed');

                    if (!this.isMockMode) {
                      this.pcPlanService.sendEmail(null, actionBy, planDate, comment, ['production', 'pd', 'PC', 'pc'], [], 'Complete').subscribe({
                        next: () => console.log('Email sent back to PD and PC successfully'),
                        error: (emailErr) => console.error('Failed to send confirmation email to PD and PC:', emailErr)
                      });
                    }

                    // For mock mode, keep them on screen to show colors
                    const allIds = [...completeIds, ...holdIds];
                    if (!this.isMockMode) {
                       allIds.forEach((id: string) => this.removeFromLists(id));
                    } else {
                       selectedItems.forEach(it => { it.Status = 'Complete'; it.mockCutStatus = this.mockCutStatusCache[it.Public_Id || it.ID_Request]; });
                    }
                    
                    selectedItems.forEach(it => {
                      delete this.editingIndex[it.Public_Id];
                    });
                    this.onFilter();
                    this.isCompleting = false;
                    this.cdRef.markForCheck();
                  },
                  error: (err: any) => {
                    Swal.fire({ icon: 'error', title: 'Confirm failed', text: err?.message });
                    this.isCompleting = false;
                    this.cdRef.markForCheck();
                  }
                });
              },
              error: (err: any) => {
                Swal.fire({ icon: 'error', title: 'Save failed', text: err?.message });
                this.isCompleting = false;
                this.cdRef.markForCheck();
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

  completeSelected() {
    if (this.isCompleting) return;

    const selectedItems = this.request.filter(it => it.Selection === true && it.Status !== 'Complete');

    if (selectedItems.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No items selected',
        text: 'Please select items to complete.',
        confirmButtonColor: '#3085d6',
      });
      return;
    }

    this.confirmItem(selectedItems[0]);
  }

  removeFromLists(id: string) {
    this.request = this.request.filter(r => (r.Public_Id !== id && r.ID_Request !== id));
    this.displayedRequests = this.displayedRequests.filter(r => (r.Public_Id !== id && r.ID_Request !== id));
    this.allRequests = this.allRequests.filter(r => (r.Public_Id !== id && r.ID_Request !== id));
  }

  ItemNo: any[] = [];
  get_ItemNo() {
    this.detailService.get_ItemNo().subscribe({
      next: (response: any[]) => {
        // Remove unique filter to allow all items.
        // Backend orders by LAST_UPDATE DESC, so .find() will hit the latest one first.
        this.ItemNo = response.map(item => ({
          ...item,
          ACCOUNT: item.ACCOUNT ?? item.account ?? ''
        }));
        this.autoFillAllMissingNames();
      },
      error: (e: any) => console.error("Error API get_ItemNo:", e),
    });
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
          row.ItemName = found.ItemName || found.EnglishName || found.Name;
          row.Req_ItemName = found.ItemName || found.EnglishName || found.Name;
          changed = true;
        }
        if (!row.SPEC) {
          row.SPEC = found.SPEC;
          row.Req_SPEC = found.SPEC;
          changed = true;
        }
        // Sync live ON_HAND stock
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
    
    if (changed) {
      this.onFilter(false);
      this.cdRef.markForCheck();
    }
  }

  syncSpecWithItemNo(row: any): Observable<any> {
    if (!row || !row.ItemNo) return of(null);
    const targetItemNo = String(row.ItemNo).trim();
    const divisionId = row.Division || '71DZ'; // Default to PMC if not set

    // 1. Try local lookup first (for immediate feedback)
    // Must match Division too: the same ItemNo can exist under both PMC (Division_Id 2) and
    // GM (Division_Id 3) with a different MAIN_LOCATION each — matching ItemNo alone risks
    // showing the wrong division's stock location before the server lookup below corrects it
    // (or worse, keeping it if the server call errors out).
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

    // 2. Fetch from Server for precision and to solve "Delay/Missing" issues
    return new Observable(observer => {
      this.detailService.getItemDetailsByNo(targetItemNo, divisionId).subscribe({
        next: (foundServer: any) => {
          if (foundServer) {
            this.updateRowWithFound(row, foundServer);
          } else {
            if (!foundLocal) { if (!row.isMockTest) { row.SPEC = ''; row.ItemName = ''; row.STOCK_ON_HAND = 0; row.ON_HAND = 0; row.MAIN_LOCATION = ''; row.MAIN_LOCATION_Name = ''; }
              this.cdRef.markForCheck();
            }
          }
          observer.next(row);
          observer.complete();
        },
        error: (err) => {
          console.warn(`Item lookup failed for ${targetItemNo} on server:`, err);
          // If not found on server AND not found locally, clear values
          if (!foundLocal) { if (!row.isMockTest) { row.SPEC = ''; row.ItemName = ''; row.STOCK_ON_HAND = 0; row.ON_HAND = 0; row.MAIN_LOCATION = ''; row.MAIN_LOCATION_Name = ''; }
            this.cdRef.markForCheck();
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

    this.cdRef.markForCheck();
  }

  getAvailableCodes(item: any): any[] {
    if (!item) return [];
    
    const currentItemNo = String(item.ItemNo || '').trim().toUpperCase();
    const reqItemNo = String(item.Req_ItemNo || item.Req_Item_No || item.ReqItemNo || '').trim().toUpperCase();
    const previousItemNo = String(item.previousItemNo || '').trim().toUpperCase();
    
    const targetItemNo = currentItemNo || reqItemNo;
    if (!targetItemNo) return [];

    const matchReq = reqItemNo.match(/^(.*?[0-9]+)/);
    const matchCur = currentItemNo.match(/^(.*?[0-9]+)/);
    const baseUpper = matchReq ? matchReq[1] : (matchCur ? matchCur[1] : targetItemNo);

    const reqSpec = String(item.Req_SPEC || item.SPEC || item.Specification || '').trim().toUpperCase();

    const list = this.ItemNo || [];
    
    const priority: { [key: string]: number } = {
      'AR': 1, 'A': 2, 'A1': 3, 'A2': 4, 'AB': 5, 'AB1': 6,
      'NR': 7, 'N': 8, 'NB': 9, 'NB1': 10, 'B': 11, 'BR': 12, '': 13
    };
    
    const digitsMatch = targetItemNo.match(/([0-9]{4,})/);
    const targetDigits = digitsMatch ? digitsMatch[1] : '';

    const matches = list.filter((x: any) => {
      const xItemNo = String(x?.ItemNo || '').trim().toUpperCase();
      if (!xItemNo) return false;

      const xDigitsMatch = xItemNo.match(/([0-9]{4,})/);
      const xDigits = xDigitsMatch ? xDigitsMatch[1] : '';

      const matchPrefix = baseUpper.length >= 3 && xItemNo.startsWith(baseUpper);
      const matchDigits = targetDigits.length >= 4 && xDigits === targetDigits;

      if (!matchPrefix && !matchDigits) return false;

      const targetSpec = reqSpec || String(item.SPEC || item.Specification || item.Spec || '').trim().toUpperCase();
      const xSpec = String(x?.SPEC || x?.spec || x?.Specification || x?.Spec || '').trim().toUpperCase();

      if (targetSpec && xSpec) {
        const normTarget = targetSpec.replace(/[\s\-_]+/g, '');
        const normX = xSpec.replace(/[\s\-_]+/g, '');
        if (normTarget !== normX) return false;
      }

      return true;
    });

    let available = matches.filter(x => {
      const xItemNo = String(x.ItemNo || '').trim().toUpperCase();
      const hasStock = Number(x.ON_HAND || x.STOCK_ON_HAND || 0) > 0;
      const isOriginal = (xItemNo === reqItemNo && reqItemNo.length > 0);
      const isPrevious = (xItemNo === previousItemNo && previousItemNo.length > 0);
      return hasStock || isOriginal || isPrevious;
    });

    available = available.filter(x => String(x.ItemNo).trim().toUpperCase() !== currentItemNo);

    const seen = new Set<string>();
    available = available.filter(x => {
      const key = String(x.ItemNo).trim().toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

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
    
    if (item.ItemNo && item.ItemNo !== newCodeItem.ItemNo) {
      item.previousItemNo = item.ItemNo;
    }
    
    this.originalItemState = { ItemNo: 'FORCE_UPDATE' }; 
    item.ItemNo = newCodeItem.ItemNo;
    this.updateRowWithFound(item, newCodeItem);
    
    this.saveEdit(item.Public_Id, true);
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
    this.cdRef.markForCheck();
  }

  holdItem(item: any) {
    if (!item) return;
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
        item.Status = 'Hold';
        const publicId = item.Public_Id || item.ID_Request;
        this.saveEdit(publicId, true); // silent save to db
        
        if (publicId) {
          this.detailService.updateStatusToComplete([publicId], 'Hold', item.TableType).subscribe({
            next: () => {
              this.cdRef.markForCheck();
              Swal.fire('Held!', 'The request has been put on hold.', 'success');
            }
          });
        }
      }
    });
  }

  stopEdit(id: string) {
    this.saveEdit(id);
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
}
