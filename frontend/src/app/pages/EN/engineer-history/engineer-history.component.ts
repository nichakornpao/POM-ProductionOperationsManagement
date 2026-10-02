import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgSelectModule } from '@ng-select/ng-select';
import { PCPlanService } from '../../../core/services/PCPlan.service';
import { PrimaryFilesPipe, ReferenceFilesPipe } from '../../../../app/pipes/file-filter.pipe';

declare var JsBarcode: any;

@Component({
  selector: 'app-engineer-history',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule, NgSelectModule, PrimaryFilesPipe, ReferenceFilesPipe],
  templateUrl: './engineer-history.component.html',
  styleUrls: ['./engineer-history.component.scss']
})
export class EngineerHistoryComponent implements OnInit {
  historyData: any[] = [];

  divisionList = [
    { label: 'GM', value: 'GM' },
    { label: 'PMC', value: 'PMC' }
  ];
  isSyncing: boolean = false;
  isLoading: boolean = true;
  get stats(): any {
    const data = this.filteredData;
    return {
      TotalAll: data.length,
      TotalWaitIssue: data.filter(r => r.Status === 'Wait Issue').length,
      TotalIssueCompleted: data.filter(r => r.Status === 'Issue Completed').length,
      TotalReturned: data.filter(r => r.ReturnQty > 0 || r.RecordBy).length
    };
  }

  // Filter
  filterDateFrom: string = ''; // 'yyyy-MM-dd'
  filterDateTo: string   = ''; // 'yyyy-MM-dd'
  filterPartNo: string = '';
  filterStatus: string = '';
  filterDivision: string | null = null;
  filterProcess: string | null = null;
  filterFac: string | null = null;
  get filteredData(): any[] {
    const fromTs = this.filterDateFrom ? new Date(this.filterDateFrom).getTime() : null;
    // เพิ่ม 1 วันเพื่อรวมวันสุดท้ายด้วย
    const toTs   = this.filterDateTo   ? new Date(this.filterDateTo).getTime() + 86400000 - 1 : null;

    return this.historyData.filter(row => {
      const rowTs = row.RequestDate ? new Date(row.RequestDate).getTime() : null;
      const matchFrom   = !fromTs || (rowTs !== null && rowTs >= fromTs);
      const matchTo     = !toTs   || (rowTs !== null && rowTs <= toTs);
      const matchPart   = !this.filterPartNo || (row.PartNo || '').toLowerCase().includes(this.filterPartNo.toLowerCase());
      const actualStatus = row.Status || 'N/A';
      const matchStatus = !this.filterStatus || actualStatus === this.filterStatus;
      const matchDivision = !this.filterDivision || (row.Division || '') === this.filterDivision;
      const matchProcess = !this.filterProcess || (row.Process || '').toLowerCase().includes(this.filterProcess.toLowerCase());
      const matchFac = !this.filterFac || (row.Fac || '').toLowerCase().includes(this.filterFac.toLowerCase());
      return matchFrom && matchTo && matchPart && matchStatus && matchDivision && matchProcess && matchFac;
    });
  }
  uniqueProcessList: { label: string; value: string }[] = [];
  uniqueFacList: { label: string; value: string }[] = [];
  
  get hasFilter(): boolean {
    return !!(this.filterDateFrom || this.filterDateTo || this.filterPartNo || this.filterStatus || this.filterDivision || this.filterProcess || this.filterFac);
  }

  // PDF Preview
  showPdfModal: boolean = false;
  isPdfLoading: boolean = false;
  pdfPreviewUrl: SafeResourceUrl | null = null;
  pdfError: string | null = null;
  selectedRow: any = null;
  pdfFileList: any[] = []; // เมื่อมีหลายไฟล์ให้เลือก
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 20;

  get paginatedData(): any[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.filteredData.slice(startIndex, startIndex + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredData.length / this.pageSize);
  }

  clearFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo   = '';
    this.filterPartNo   = '';
    this.filterStatus   = '';
    this.filterDivision = null;
    this.filterProcess  = null;
    this.filterFac      = null;
    this.currentPage = 1;
  }

  onFilterChange(): void {
    this.currentPage = 1;
    if (this.activeTab === 'PlanListEN') {
      this.planListEnFilterDivision = this.filterDivision;
      this.loadPlanListEN();
    }
  }



  get visiblePages(): number[] {
    const pages = [];
    let startPage = Math.max(1, this.currentPage - 2);
    let endPage = Math.min(this.totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
  
  // URL ของ Backend
  apiUrl = 'http://localhost:3100/api';

  activeTab: 'Engineer' | 'PlanListEN' = 'Engineer';

  planListEnData: any[] = [];
  isPlanListLoading: boolean = false;
  planListEnCurrentPage: number = 1;
  planListEnTotalPages: number = 1;
  planListEnPageSize: number = 20;
  planListEnTotalCount: number = 0;
  planListEnCounts: any = { upcoming: 0, required: 0, completed: 0, return: 0 };
  
  planListEnFilterDate: string = '';
  planListEnProcessOptions: string[] = [];
  planListEnFilterDateFrom: string = '';
  planListEnFilterDateTo: string = '';
  planListEnFilterProcess: string | null = null;
  planListEnFilterPartNo: string = '';
  planListEnFilterDivision: string | null = null;
  planListEnFilterStatus: string | null = null;

  planListEnSubActiveTab: 'plan' | 'returned' = 'plan';

  constructor(private http: HttpClient, private sanitizer: DomSanitizer, private pcPlanService: PCPlanService) {}

  setActiveTab(tab: 'Engineer' | 'PlanListEN') {
    this.activeTab = tab;
    if (tab === 'PlanListEN' && this.planListEnData.length === 0) {
      this.loadPlanListEN();
    }
  }

  loadPlanListEN(): void {
    this.isPlanListLoading = true;
    const params = {
      page: this.planListEnCurrentPage,
      pageSize: this.planListEnPageSize,
      department: 'EN',
      subTab: 'ALL',
      showHistory: false,
      filterDate: this.planListEnFilterDateFrom || null, // Backend currently only supports one filterDate
      filterProcess: this.planListEnFilterProcess || null,
      filterPartNo: this.planListEnFilterPartNo || null,
      filterDivision: this.planListEnFilterDivision || null,
      filterStatus: this.planListEnFilterStatus || null,
      sortDir: 'DESC'
    };

    this.pcPlanService.getPlanListPaginated(params).subscribe({
      next: (res) => {
        // Accumulate unique processes
        const uniqueProcesses = new Set([
          ...this.planListEnProcessOptions,
          ...res.data.map((item: any) => item.Process).filter((p: any) => p)
        ]);
        this.planListEnProcessOptions = Array.from(uniqueProcesses).sort() as string[];

        this.planListEnData = res.data.map((item: any) => {
          let recordBy = item['Return Balance'] || item['Return_Balance'] || item.RecordBy || item.Return_By || '-';
          if (recordBy === '-' && item.Is_Return_OK) {
            const dateStr = item.DateComplete ? (new Date(item.DateComplete).toLocaleDateString('en-GB') + ' ' + new Date(item.DateComplete).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})) : '';
            recordBy = item.Employee_ID ? `${item.Employee_ID} ${dateStr}`.trim() : 'Returned';
          }
          return {
            ...item,
            Division: item.Division === '1' ? 'GM' : (item.Division === '2' ? 'PMC' : item.Division),
            MCType: item.MC_Type,
            Fac: item.Facility,
            PartBefore: item.Before_Part,
            MCNo: item.MC_No,
            PathDwg: item.Path_Dwg,
            PathLayout: item.Path_Layout,
            Status: item.ReqStatus || item.PlanStatus || 'Active',
            ReqQty: item.ReqQty !== undefined ? item.ReqQty : (item.QTY || 0),
            ReturnQty: item.ReturnQty !== undefined ? item.ReturnQty : (item.Is_Return_OK ? (item.QTY || 1) : 0),
            RecordBy: recordBy
          };
        });
        this.planListEnTotalCount = res.pagination ? res.pagination.totalCount : (res.totalCount || 0);
        this.planListEnCounts = res.counts || { upcoming: 0, required: 0, completed: 0, return: 0 };
        this.planListEnTotalPages = res.pagination ? res.pagination.totalPages : (Math.ceil(this.planListEnTotalCount / this.planListEnPageSize) || 1);
        this.isPlanListLoading = false;
      },
      error: (err) => {
        console.error('Error fetching Plan List EN', err);
        this.isPlanListLoading = false;
      }
    });
  }

  onPlanListEnFilterChange(): void {
    this.planListEnCurrentPage = 1;
    this.loadPlanListEN();
  }

  get filteredPlanListEnData(): any[] {
    let data = this.planListEnData;
    if (this.planListEnFilterStatus && this.planListEnFilterStatus !== 'N/A') {
      data = data.filter(row => {
        if (this.planListEnFilterStatus === 'Issue Completed') return row.Status === 'Complete';
        if (this.planListEnFilterStatus === 'Wait Issue') return row.Status === 'Waiting';
        return row.Status === this.planListEnFilterStatus;
      });
    }
    return data;
  }

  getPlanListEnCount(status: string): number {
    if (!this.planListEnData) return 0;
    return this.planListEnData.filter(row => {
      if (status === 'Issue Completed') return row.Status === 'Complete';
      if (status === 'Wait Issue') return row.Status === 'Waiting';
      return row.Status === status;
    }).length;
  }

  get hasPlanListEnFilter(): boolean {
    return !!(this.planListEnFilterDateFrom || this.planListEnFilterDateTo || this.planListEnFilterProcess || this.planListEnFilterPartNo || this.planListEnFilterStatus);
  }

  clearPlanListEnFilters(): void {
    this.planListEnFilterDateFrom = '';
    this.planListEnFilterDateTo = '';
    this.planListEnFilterProcess = null;
    this.planListEnFilterPartNo = '';
    this.planListEnFilterStatus = null;
    this.onPlanListEnFilterChange();
  }

  get visiblePlanListEnPages(): number[] {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, this.planListEnCurrentPage - Math.floor(maxVisible / 2));
    let end = start + maxVisible - 1;

    if (end > this.planListEnTotalPages) {
      end = this.planListEnTotalPages;
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPlanListEnPage(page: number): void {
    if (page >= 1 && page <= this.planListEnTotalPages) {
      this.planListEnCurrentPage = page;
      this.loadPlanListEN();
    }
  }

  ngOnInit(): void {
    this.fetchHistory();
  }

  fetchHistory(): void {
    this.isLoading = true;
    this.http.get<any[]>(`${this.apiUrl}/engineer-history`).subscribe({
      next: (data) => {
        this.historyData = data;
        
        // Populate uniqueProcessList
        const processes = data.map(r => r.Process).filter(p => !!p);
        const uniqueProc = [...new Set(processes)].sort();
        this.uniqueProcessList = uniqueProc.map(p => ({ label: p, value: p }));
        
        // Populate uniqueFacList
        const facs = data.map(r => r.Fac).filter(f => !!f && f !== '-');
        const uniqueFacs = [...new Set(facs)].sort();
        this.uniqueFacList = uniqueFacs.map(f => ({ label: f, value: f }));
        
        this.currentPage = 1;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching history:', err);
        this.isLoading = false;
      }
    });
  }

  // Barcode Modal
  showBarcodeModal: boolean = false;
  selectedBarcode: string = '';
  @ViewChild('modalBarcodeSvg') barcodeSvg!: ElementRef;
  
  // Export PDF
  @ViewChild('pdfModal') pdfModal!: ElementRef;

  // Tooling Request Details Modal
  isToolingRequestModalOpen: boolean = false;
  toolingRequestLoading: boolean = false;
  toolingRequestHeader: any = null;
  toolingCuttingList: any[] = [];
  toolingSetupList: any[] = [];

  openBarcode(requestNo: string): void {
    this.selectedBarcode = requestNo;
    this.showBarcodeModal = true;
    setTimeout(() => {
      if (typeof JsBarcode !== 'undefined' && this.barcodeSvg) {
        JsBarcode(this.barcodeSvg.nativeElement, requestNo, {
          format: 'CODE128',
          height: 100,
          width: 2.5,
          displayValue: true,
          fontSize: 20,
          margin: 10
        });
      }
    }, 150);
  }

  closeBarcodeModal(): void {
    this.showBarcodeModal = false;
    this.selectedBarcode = '';
  }

  syncNow(): void {
    this.isSyncing = true;
    this.http.post(`${this.apiUrl}/en-sync/now`, {}).subscribe({
      next: (res: any) => {
        // แอบรอ 1 วินาที ให้เห็น animation หมุนๆ
        setTimeout(() => {
          this.fetchHistory();
          this.isSyncing = false;
        }, 1000);
      },
      error: (err) => {
        alert('Error syncing data.');
        this.isSyncing = false;
      }
    });
  }
  selectedDocType: 'DWG' | 'LAYOUT' = 'DWG';

  printDwg(row: any, type: 'DWG' | 'LAYOUT' = 'DWG'): void {
    const filePath = type === 'DWG' ? row.PathDwg : row.PathLayout;
    
    if (!filePath || filePath === '-') {
      alert(`ไม่พบที่อยู่ไฟล์ ${type} เนื่องจากไม่มีเส้นทางเก็บไว้ในระบบ`);
      return;
    }
    this.selectedRow = row;
    this.selectedDocType = type;
    this.showPdfModal = true;
    this.isPdfLoading = true;
    this.pdfPreviewUrl = null;
    this.pdfFileList = [];
    this.pdfError = null;

    // Remove any leading/trailing quotes from the path string
    const cleanPath = filePath.replace(/^["']|["']$/g, '');

    // เรียก Backend proxy API เพื่อดึงไฟล์ PDF ออกจาก UNC share \\pbp083
    const encodedPath = encodeURIComponent(cleanPath);
    let checkUrl = `${this.apiUrl}/print-pdf?filePath=${encodedPath}&fromTab=${this.activeTab}`;
    
    const reqNo = this.activeTab === 'PlanListEN'
      ? (row.RequestNo || (row.Plan_ID ? `PLAN-${row.Plan_ID}` : row.PartNo))
      : row.RequestNo;

    if (reqNo) {
      checkUrl += `&requestNo=${encodeURIComponent(reqNo)}`;
    }
    checkUrl += `&docType=${type}`;

    fetch(checkUrl, { cache: 'no-store' }).then(async response => {
      // 1. ตรวจสอบข้อมูลดิบๆ เลยว่าเป็น JSON หรือเปล่า (เพิกเฉยต่อ Content-Type ที่อาจถูก Proxy แปลงมา)
      try {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        
        // ลองเช็คเบื้องต้นว่าเป็น JSON ไหม
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
          const data = JSON.parse(text);
          if (data.multipleFiles) {
            this.pdfFileList = data.files;
          } else {
            this.pdfError = data.error || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์';
          }
          this.isPdfLoading = false;
          return;
        }
      } catch (e) {
        // เงียบไว้ ถ้า error แปลว่าไม่ใช่ JSON
      }

      // 2. ถ้ามาถึงตรงนี้ แสดงว่าข้อมูลไม่ใช่ JSON (น่าจะเป็นไฟล์ PDF)
      if (response.ok) {
        this.pdfPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(checkUrl);
      } else {
        this.pdfError = 'ไม่สามารถเปิดไฟล์ได้ หรือไม่พบไฟล์';
        this.isPdfLoading = false;
      }
    }).catch(err => {
      this.pdfError = err.message;
      this.isPdfLoading = false;
    });
  }

  selectPdfFile(file: any): void {
    // เก็บ pdfFileList ไว้ เพื่อให้พอกด Back จะได้กลับมาหน้ารายการได้
    this.isPdfLoading = true;
    const reqNo = this.activeTab === 'PlanListEN'
      ? (this.selectedRow?.RequestNo || (this.selectedRow?.Plan_ID ? `PLAN-${this.selectedRow.Plan_ID}` : this.selectedRow?.PartNo))
      : this.selectedRow?.RequestNo;

    let url = `${this.apiUrl}/print-pdf?filePath=${encodeURIComponent(file.fullPath)}&fromTab=${this.activeTab}`;
    if (reqNo) {
      url += `&requestNo=${encodeURIComponent(reqNo)}`;
    }
    if (this.selectedDocType) {
      url += `&docType=${this.selectedDocType}`;
    }
    this.pdfPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  goBackToFileList(): void {
    this.pdfPreviewUrl = null;
    this.isPdfLoading = false;
    this.pdfError = null;
  }

  onIframeLoad(): void {
    this.isPdfLoading = false;
  }

  closePdfModal(): void {
    this.showPdfModal = false;
    this.pdfPreviewUrl = null;
    this.selectedRow = null;
    this.pdfError = null;
  }

  printIframe(): void {
    const iframe = document.getElementById('pdf-preview-frame') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print();
    }
  }

  // ===================================================
  //  Tooling Request Details Modal
  // ===================================================

  onViewToolingRequest(item: any) {
    this.isToolingRequestModalOpen = true;
    this.toolingCuttingList = [];
    this.toolingSetupList = [];
    this.toolingRequestLoading = true;

    // Set header info directly from plan item
    this.toolingRequestHeader = {
      partNo: item.PartNo || item.partNo || '-',
      process: item.Process || item.process || '-',
      mcType: item.MCType || item.mcType || '-',
      mcNo: item.MCNo || item.mcNo || '-',
      fac: item.Fac || item.fac || '-',
      requester: item.Requestor || item.employeeId || '-'
    };

    if (!item.Unique_Id) {
      console.warn('⚠️ [TOOLING REQUEST] No Unique_Id found');
      this.toolingRequestLoading = false;
      return;
    }

    this.toolingRequestLoading = true;
    const apiUrl = `${this.apiUrl}/get_ToolingRequest_ByUniqueId`;

    this.http.post<any>(apiUrl, { uniqueId: item.Unique_Id }).subscribe({
      next: (result) => {
        this.toolingCuttingList = result?.cuttingTool || result?.cuttingTools || [];
        this.toolingSetupList = result?.setupTool || result?.setupTools || [];
        this.toolingRequestLoading = false;
      },
      error: (err) => {
        console.error('❌ [TOOLING REQUEST] API error:', err);
        this.toolingRequestLoading = false;
      }
    });
  }

  closeToolingRequestModal() {
    this.isToolingRequestModalOpen = false;
    this.toolingRequestHeader = null;
    this.toolingCuttingList = [];
    this.toolingSetupList = [];
  }

  getRequestStatusStyle(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'pending': return 'background:#fff7ed; color:#c2410c; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
      case 'waiting': return 'background:#fef9c3; color:#854d0e; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
      case 'in progress': return 'background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
      case 'success': return 'background:#dcfce7; color:#166534; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
      case 'complete':
      case 'completed': return 'background:#dcfce7; color:#166534; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
      case 'cancelled': return 'background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
      case 'pending issue': return 'background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
      default: return 'background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:999px; font-size:0.78rem;';
    }
  }

}
