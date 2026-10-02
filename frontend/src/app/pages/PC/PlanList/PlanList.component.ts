import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, NgZone, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, forkJoin, Observable } from 'rxjs';
import { switchMap, takeUntil, debounceTime } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service'; // Start Import
import { environment } from '../../../../environments/environment';

declare var JsBarcode: any;

import { SidebarComponent } from '../../../components/sidebar/sidebar.component';
import { PCPlanService } from '../../../core/services/PCPlan.service';
import { FileUploadSerice } from '../../../core/services/FileUpload.service';
import { HistoryPrint } from '../../../core/services/HistoryPrint.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import Swal from 'sweetalert2';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule, MAT_DATE_LOCALE, DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { CustomDateAdapter } from '../../../core/utils/custom-date-adapter';
import { CalendarModule } from 'primeng/calendar';
import { NgSelectModule } from '@ng-select/ng-select';
import { NotificationComponent } from '../../../components/notification/notification.component';
import { NotificationService } from '../../../core/services/notification.service';
import { PrintActionBtnComponent } from './components/print-action-btn/print-action-btn.component';

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
  selector: 'app-plan-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatInputModule,
    MatFormFieldModule,
    MatNativeDateModule,
    MatButtonModule,

    CalendarModule,
    NotificationComponent,
    PrintActionBtnComponent,
    NgSelectModule
  ],
  providers: [
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS }
  ],
  templateUrl: './PlanList.component.html',
  styleUrls: ['./PlanList.component.scss']
})
export class PlanListComponent implements OnInit, OnDestroy {

  // ตัวแปรสำหรับ Filter
  filterDate: Date | null = null;
  filterDivision: string = 'All';
  filterMachineType: string[] = [];
  filterStatus: string[] = [];
  filterFac: string[] = [];
  filterProcess: string[] = [];
  filterPartNo: string[] = [];
  showHistory: boolean = false; // Toggle for Global History

  // New Tab Structure
  departments: string[] = ['PC', 'PD', 'PH', 'EN', 'QC', 'Gague', 'View'];
  selectedDepartment: string = ''; // Initialize empty to prevent "Flash of PC Content" before role check

  subTabs: string[] = ['Upcoming'];
  selectedSubTab: string = 'Upcoming';

  dateRanges: string[] = ['7 DAY', '30 DAY', 'ALL'];
  selectedDateRange: string = 'ALL';

  // For storing pre-calculated counts
  subTabCounts: { [key: string]: number } = {};

  // --- Return Tab (PD Only) ---
  returnCount: number = 0;      // Red badge count for pending returns

  // --- Server-Side Pagination ---
  currentPage: number = 1;
  pageSize: number = 100;
  totalPages: number = 1;
  totalCount: number = 0;
  isLoading: boolean = false;

  // --- Skeleton Loading ---
  skeletonRows: number[] = Array.from({ length: 10 }, (_, i) => i); // 10 placeholder rows

  // --- EN Attachments Modal Data ---
  enDwgPaths: string[] = [''];
  enDwgRevs: string[] = [''];
  enDwgQty: number | null = null;

  enLayoutPaths: string[] = [''];
  enLayoutRevs: string[] = [''];
  enLayoutQty: number | null = null;

  // --- Race Condition Prevention ---
  private loadTrigger$ = new Subject<any>();
  private sseTrigger$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  currentUser: any;

  // --- Permission Helpers ---
  get canEditPC(): boolean { return this.authService.isPC(); }
  get canAttachEng(): boolean { return this.authService.isEngineer(); }
  get canAttachQC(): boolean { return this.authService.isQC(); }
  get canRequest(): boolean { return this.authService.isPD(); }

  // --- Expired Task Visibility ---
  // Expired tasks are shown on PC tab (always) and PD tab (all sub-tabs) to sync with PC.
  // Hidden from EN, QC, and all other tabs.
  get canSeeExpiredTasks(): boolean {
    return !!(this.showHistory || this.filterDate);
  }

  // --- Complete Lock Helper ---
  // Returns true when the plan is linked to a request that has Status_To_PH = 'Complete'
  // → disables Cancel button and locks key fields in the edit modal
  isEditLockedByComplete(item: any): boolean {
    const status = (item?.statusToPH || item?.reqStatus || '').toUpperCase();
    return status === 'COMPLETE' || status === 'COMPLETED' || status === 'WAITING' || status === 'IN PROGRESS';
  }

  // รายการใน Dropdown Filter (สำหรับ Tool Bar บนตาราง)
  divisions: string[] = [];
  machineTypes: string[] = ['CNC', 'Lathe', 'Milling'];
  facList: string[] = [];
  processList: string[] = [];
  partNoList: string[] = [];
  partBeforeList: string[] = [];
  barTypeList: string[] = [];
  statusList: string[] = ['READY', 'Wait Eng', 'Wait QC', 'Wait En & QC', 'Cancelled'];

  // รายการ Dropdown สำหรับหน้าต่างกดย่อย (Edit Modal) โดยเฉพาะ (ดึงจาก API)
  modalMachineTypes: string[] = [];
  modalFacList: string[] = [];
  modalProcessList: string[] = [];
  modalPartNoList: string[] = [];
  modalPartBeforeList: string[] = [];
  modalBarTypeList: string[] = [];

  // ข้อมูลตาราง
  planList: any[] = [];
  filteredPlanList: any[] = []; // เพิ่มตัวแปรสำหรับเก็บข้อมูลที่กรองแล้ว

  // ─── Accordion Grouping State ───
  expandedGroups: Set<string> = new Set();
  groupedPlanList: { key: string; date: string; items: any[]; orderCount: number; totalCount: number; isAllCancelled: boolean; isFinished: boolean; isExpired: boolean; summaryParts: string; rev?: string; revTooltip?: string; timeDisplay?: string; allTimes?: string }[] = [];

  // ===== Export Modal State =====
  activeFilter: string | null = null;

  toggleFilter(column: string) {
    this.activeFilter = this.activeFilter === column ? null : column;
  }

  @HostListener('document:click', ['$event'])
  closeFilter(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.filter-wrapper')) {
      this.activeFilter = null;
    }
  }

  showExportModal: boolean = false;
  exportMode: 'current' | 'history' | null = null;
  exportMonth: number = new Date().getMonth() + 1; // 1-12
  exportYear: number = new Date().getFullYear();
  isExporting: boolean = false;
  readonly exportMonths = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];
  readonly exportYears: number[] = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  // Print Properties
  canPrint = false;
  isPrintModalOpen = false;
  isFullScreenPreviewOpen = false;
  selectedItemForPrint: any = null;
  printType: string | null = null;
  printQty: number | null = null;
  previewUrl: SafeResourceUrl | null = null;
  printTypeOptions = [
    { label: 'Layout', value: 'pathLayout' }, // matches property name in item
    { label: 'Drawing', value: 'pathDwg' }    // matches property name in item
  ];

  // ===== EN Auto-Path State =====
  enAutoPathDwg: boolean = false;  // true = system found it (blue), false = manual (red)
  enAutoPathLayout: boolean = false;  // true = system found it (blue), false = manual (red)
  enAutoPathLoading: boolean = false;

  // ===== Tooling Request Modal (PD Tab) =====
  isToolingRequestModalOpen: boolean = false;
  toolingRequestLoading: boolean = false;
  toolingRequestHeader: any = null;
  toolingCuttingList: any[] = [];
  toolingSetupList: any[] = [];

  // ===== Barcode Modal & Scanner Filter State =====
  showBarcodeModal: boolean = false;
  selectedBarcode: string = '';
  barcodeSearch: string = '';
  @ViewChild('modalBarcodeSvg') barcodeSvg!: ElementRef;

  openBarcode(barcode: string): void {
    if (!barcode) return;
    this.selectedBarcode = barcode;
    this.showBarcodeModal = true;
    setTimeout(() => {
      if (typeof JsBarcode !== 'undefined' && this.barcodeSvg) {
        JsBarcode(this.barcodeSvg.nativeElement, barcode, {
          format: 'CODE128',
          height: 90,
          width: 2.2,
          displayValue: true,
          fontSize: 18,
          margin: 10
        });
      }
    }, 150);
  }

  closeBarcodeModal(): void {
    this.showBarcodeModal = false;
    this.selectedBarcode = '';
  }

  onBarcodeSearchChange(): void {
    this.currentPage = 1;
    this.loadPlanListPaginated(1);
  }

  clearBarcodeSearch(): void {
    this.barcodeSearch = '';
    this.currentPage = 1;
    this.loadPlanListPaginated(1);
  }

  applyBarcodeFilter(): void {
    if (!this.barcodeSearch || !this.barcodeSearch.trim()) return;
    const term = this.barcodeSearch.trim().toLowerCase();
    this.filteredPlanList = this.filteredPlanList.filter((item: any) => {
      const reqNo = String(item.requestNo || item.RequestNo || '').toLowerCase();
      const group = String(item.groupId || '').toLowerCase();
      const part = String(item.partNo || '').toLowerCase();
      return reqNo.includes(term) || group.includes(term) || part.includes(term);
    });
  }

  // ===== Real-Time SSE Updates =====
  private eventSource: EventSource | null = null;

  constructor(
    private pcPlanService: PCPlanService,
    private fileUploadService: FileUploadSerice,
    private historyPrint: HistoryPrint,
    private sanitizer: DomSanitizer,
    private router: Router,
    private authService: AuthService, // Injected
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef, // Added for click event detection
    private notificationService: NotificationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  // --- EN Completed Checkbox Selection & Batch Edit ---
  selectedEnPlanIds: Set<number> = new Set<number>();
  selectedEnUniqueIds: Set<string> = new Set<string>();
  isEnBatchMode: boolean = false;
  enBatchItems: any[] = [];

  toggleEnRowSelection(item: any, event: any): void {
    const isChecked = event.target.checked;
    const planId = item.id || item.Plan_ID || item.planId;
    const uniqueId = item.Unique_Id || item.uniqueId;

    if (isChecked) {
      if (planId) this.selectedEnPlanIds.add(Number(planId));
      if (uniqueId) this.selectedEnUniqueIds.add(String(uniqueId));
    } else {
      if (planId) this.selectedEnPlanIds.delete(Number(planId));
      if (uniqueId) this.selectedEnUniqueIds.delete(String(uniqueId));
    }
  }

  isEnRowSelected(item: any): boolean {
    const planId = item.id || item.Plan_ID || item.planId;
    const uniqueId = item.Unique_Id || item.uniqueId;
    if (planId && this.selectedEnPlanIds.has(Number(planId))) return true;
    if (uniqueId && this.selectedEnUniqueIds.has(String(uniqueId))) return true;
    return false;
  }

  toggleSelectAllEn(event: any): void {
    const isChecked = event.target.checked;
    if (isChecked) {
      // Select only items visible on screen (not hidden expired/ready rows)
      this.visibleGroupedPlanList.forEach((group: any) => {
        group.items
          .filter((it: any) => it.planStatus !== 'Cancelled' && !it._isExpired)
          .forEach((item: any) => {
            const planId = item.id || item.Plan_ID || item.planId;
            const uniqueId = item.Unique_Id || item.uniqueId;
            if (planId) this.selectedEnPlanIds.add(Number(planId));
            if (uniqueId) this.selectedEnUniqueIds.add(String(uniqueId));
          });
      });
    } else {
      this.selectedEnPlanIds.clear();
      this.selectedEnUniqueIds.clear();
    }
  }

  isAllEnSelected(): boolean {
    const visibleItems = this.visibleGroupedPlanList
      .flatMap((g: any) => g.items)
      .filter((it: any) => it.planStatus !== 'Cancelled' && !it._isExpired);
    if (!visibleItems || visibleItems.length === 0) return false;
    return visibleItems.every((item: any) => this.isEnRowSelected(item));
  }

  getSelectedEnCount(): number {
    return Math.max(this.selectedEnPlanIds.size, this.selectedEnUniqueIds.size);
  }

  clearEnSelection(): void {
    this.selectedEnPlanIds.clear();
    this.selectedEnUniqueIds.clear();
    this.enBatchItems = [];
    this.isEnBatchMode = false;
  }

  openBatchAddPathModal(): void {
    const selectedItems = (this.filteredPlanList || []).filter((item: any) => this.isEnRowSelected(item));
    if (selectedItems.length === 0) return;

    this.isEnBatchMode = true;
    this.enBatchItems = selectedItems;
    this.onEdit(selectedItems[0]);
  }

  markEnSelectedCompleted(): void {
    const planIds = Array.from(this.selectedEnPlanIds);
    const uniqueIds = Array.from(this.selectedEnUniqueIds);

    if (planIds.length === 0 && uniqueIds.length === 0) return;

    // Validation: EN must provide BOTH Path Drawing and Path Layout before marking Completed
    const selectedItems = this.filteredPlanList.filter((item: any) => this.isEnRowSelected(item));
    const incompleteItems = selectedItems.filter((item: any) => {
      const hasDwg = item.pathDwg && item.pathDwg !== '-' && item.pathDwg.trim() !== '';
      const hasLayout = item.pathLayout && item.pathLayout !== '-' && item.pathLayout.trim() !== '';
      return !hasDwg || !hasLayout;
    });

    if (incompleteItems.length > 0) {
      Swal.fire({
        title: 'ข้อมูลยังไม่ครบถ้วน',
        text: `มีจำนวน ${incompleteItems.length} รายการที่ยังไม่มี Path Drawing หรือ Path Layout กรุณาเพิ่มไฟล์ให้ครบถ้วนก่อนกด Completed ครับ`,
        icon: 'warning',
        confirmButtonColor: '#0f172a'
      });
      return;
    }

    const count = this.getSelectedEnCount();
    Swal.fire({
      title: 'ยืนยัน Completed รายการ?',
      text: `คุณต้องการย้ายรายการที่เลือกจำนวน ${count} รายการ ไปยังหน้า Completed หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ยืนยัน (Completed)',
      cancelButtonText: 'ยกเลิก'
    }).then((result) => {
      if (result.isConfirmed) {
        this.pcPlanService.markEnCompleted({ planIds, uniqueIds }).subscribe({
          next: (res: any) => {
            Swal.fire('สำเร็จ!', `ย้ายรายการไปหน้า Completed เรียบร้อยแล้ว (${res.count || count} รายการ)`, 'success');
            this.selectedEnPlanIds.clear();
            this.selectedEnUniqueIds.clear();
            this.loadPlanListPaginated(this.currentPage);
          },
          error: (err: any) => {
            console.error('Error marking EN completed:', err);
            Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกสถานะได้', 'error');
          }
        });
      }
    });
  }

  // Machine Data Cache - REMOVED (User requested Excel-style filtering based on actual list data)

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const userSession = sessionStorage.getItem('user');
        if (userSession) {
          this.currentUser = JSON.parse(userSession);
        } else {
          // Handle no user session (e.g., redirect to login or show empty state)
          console.warn('No user session found on refresh.');
          this.currentUser = {};
        }
      } catch (e) {
        console.error('Error parsing user session:', e);
        this.currentUser = {};
      }

      this.checkPrintPermission();

      // --- RBAC: Filter Departments based on Role ---
      // Mapping: Role -> Visible Departments
      const role = this.currentUser.Role;

      // 1. Show ALL Viewtabs for everyone
      this.departments = ['PC', 'PD', 'PH', 'EN', 'QC', 'Gague', 'View'];

      // 2. Determine which tabs are ACCESSIBLE (Clickable)
      let allowed: string[] = [];

      if (role) {
        switch (role) {
          case 'admin':
            allowed = ['PC', 'PD', 'PH', 'EN', 'QC', 'Gague', 'View'];
            break;
          case 'PC':
            allowed = ['PC'];
            break;
          case 'production':
            allowed = ['PD'];
            break;
          case 'purchase':
            allowed = ['PH'];
            break;
          case 'engineer':
            allowed = ['EN'];
            break;
          case 'QC':
            allowed = ['QC'];
            break;
          case 'Gague':
            allowed = ['Gague'];
            break;
          case 'Cost':
          case 'view': // Assuming view role also sees View tab
            allowed = ['View'];
            break;
          default:
            allowed = []; // Or 'View' as safe default?
            break;
        }
      }
      this.allowedDepartments = allowed;

      // ─── switchMap pipeline: cancels previous in-flight request on rapid tab switches ───
      this.loadTrigger$
        .pipe(
          switchMap((params: any) => {
            // Instant clear + skeleton before HTTP fires
            this.filteredPlanList = [];
            this.isLoading = true;
            return this.pcPlanService.getPlanListPaginated(params);
          }),
          takeUntil(this.destroy$)
        )
        .subscribe({
          next: (res: any) => {
            // console.log('[PlanList DEBUG] API response received — res.data length:', res.data?.length, 'sample:', res.data?.[0]);
            this.filteredPlanList = (res.data || []).map((item: any) => {
              const hasDwg = item.Path_Dwg && item.Path_Dwg !== '-' && item.Path_Dwg.trim() !== '';
              const hasLayout = item.Path_Layout && item.Path_Layout !== '-' && item.Path_Layout.trim() !== '';
              const hasIIQC = item.Path_IIQC && item.Path_IIQC !== '-' && item.Path_IIQC.trim() !== '';

              const dwgSrc = item.drawingSource || item.Path_Dwg_Source;
              const layoutSrc = item.layoutSource || item.Path_Layout_Source;

              const comment = (item.Comment || item.comment || '').toLowerCase();
              const partNo = (item.PartNo || item.partNo || '').toLowerCase();
              const isTest = comment.includes('test') || partNo.includes('test');

              const isDwgDone = hasDwg && (dwgSrc === 'manual' || isTest);
              const isLayoutDone = hasLayout && (layoutSrc === 'manual' || isTest);
              const isEnDone = isDwgDone && isLayoutDone;
              const hasQC = hasIIQC;
              let sVal = 'READY';
              if (!isEnDone && !hasQC) sVal = 'WAIT_BOTH';
              else if (!isEnDone) sVal = 'WAIT_ENG';
              else if (!hasQC) sVal = 'WAIT_QC';

              return {
                id: item.Plan_ID,
                date: item.PlanDate ? new Date(item.PlanDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
                dateTimeRecord: item.DateTime_Record || null,
                dateTimeRecordDisplay: this.formatDateTimeRecord(item.DateTime_Record),
                division: this.mapDivisionName(item.Division),
                divisionCode: item.Division,
                mcType: item.MC_Type,
                barType: item.Bar_Type || null,
                fac: item.Facility,
                process: item.Process,
                partBefore: item.Before_Part,
                mcNo: item.MC_No,
                partNo: item.PartNo,
                qty: item.QTY,
                time: item.Time,
                mcQty: (() => {
                  const directVal = item.MC_QTY ?? item.MC_Qty ?? item.mcQty;
                  if (directVal !== null && directVal !== undefined && !isNaN(Number(directVal)) && Number(directVal) > 0) {
                    return Number(directVal);
                  }
                  if (item.MC_No && typeof item.MC_No === 'string' && item.MC_No.trim() !== '' && item.MC_No !== '-') {
                    const count = item.MC_No.split(/[,/]+/).map((s: string) => s.trim()).filter((s: string) => s && s !== '-').length;
                    if (count > 0) return count;
                  }
                  return directVal ?? null;
                })(),
                comment: item.Comment,
                pathDwg: item.Path_Dwg || '-',
                pathLayout: item.Path_Layout || '-',
                iiqc: item.Path_IIQC || '-',
                drawingSource: item.drawingSource || item.Path_Dwg_Source || null,
                layoutSource: item.layoutSource || item.Path_Layout_Source || null,
                returnBalance: item['Return Balance'] || item.Return_Balance || null,
                returnQty: item.ReturnQty || null,
                isEnCompleted: item.Is_EN_Completed === true || item.Is_EN_Completed === 1,
                revision: item.Revision,
                pathDwgRev: (item.Path_Dwg_Rev !== undefined && item.Path_Dwg_Rev !== null) ? item.Path_Dwg_Rev : (item.pathDwgRev || null),
                pathLayoutRev: (item.Path_Layout_Rev !== undefined && item.Path_Layout_Rev !== null) ? item.Path_Layout_Rev : (item.pathLayoutRev || null),
                planStatus: item.PlanStatus || 'Active',
                groupId: item.GroupId,
                requestNo: item.RequestNo || item.requestNo || `PLAN-${item.Plan_ID}`,
                Unique_Id: item.Unique_Id || null,
                employeeId: item.Employee_ID || null,
                requester: item.Employee_ID || null,
                statusToPH: item.Status_To_PH || null,
                reqStatus: item.ReqStatus || null,
                isFullyCompleted: item.IsFullyCompleted === 1,
                hasReturned: !!item.HasReturned,
                isLatest: item.IsLatestServer !== 0,
                printLayoutCount: 0,
                printDwgCount: 0,
                pseudoGroupId: item.PseudoGroupId || item.GroupId,
                computedStatus: sVal
              };
            });

            // Compute group boundaries for CSS styling (.group-start)
            let currentGroupId: string | null = null;
            this.filteredPlanList.forEach((item: any) => {
              if (item.pseudoGroupId !== currentGroupId) {
                item.isGroupStart = true;
                currentGroupId = item.pseudoGroupId;
              } else {
                item.isGroupStart = false;
              }
            });

            // Update pagination
            const pag = res.pagination || {};
            this.totalCount = pag.totalCount || 0;
            this.totalPages = pag.totalPages || 1;

            // Update badge counts
            const counts = res.counts || {};
            this.subTabCounts = {
              'Upcoming': counts.upcoming || 0,
              'Required': counts.required || 0,
              'Completed': counts.completed || 0
            };
            this.returnCount = counts.return || 0;

            // Store all rows for filter option extraction
            this.planList = [...this.filteredPlanList];

            // Update dropdown filter options
            this.updateMachineTypeOptions();
            this.applyClientStatusFilter();
            this.applyBarcodeFilter();
            this.groupPlanList();
            this.isLoading = false;
          },
          error: (err: any) => {
            console.error('[Paginated] Error loading plan list:', err);
            this.filteredPlanList = [];
            this.isLoading = false;
          }
        });

      // 3. Set initial selected department & trigger initial load
      if (!this.allowedDepartments.includes(this.selectedDepartment)) {
        if (this.allowedDepartments.length > 0) {
          this.selectDepartment(this.allowedDepartments[0]);
        } else {
          this.selectedDepartment = '';
        }
      } else {
        this.selectDepartment(this.selectedDepartment);
      }

      // Debounce SSE updates to prevent rapid re-fetching
      this.sseTrigger$.pipe(
        debounceTime(500),
        takeUntil(this.destroy$)
      ).subscribe(() => {
        this.loadPlanListPaginated(this.currentPage);
      });

      this.setupSSE();

    }
  }

  // ===== Real-Time SSE Updates =====
  private setupSSE(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Connect to the backend SSE endpoint
    this.eventSource = new EventSource(`${environment.apiUrl}/events/planlist`);

    this.eventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'PLANLIST_UPDATE') {
            console.log('[SSE] Planlist update received. Queuing refresh...');
            this.sseTrigger$.next();
          }
        } catch (e) {
          console.error('[SSE] Error parsing SSE message:', e);
        }
      });
    };

    this.eventSource.onerror = (err) => {
      console.error('[SSE] EventSource error', err);
      // EventSource auto-reconnects by default, but we can log it here
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('[SSE] Connection closed.');
    }
  }

  // Load Machine Types dynamically from the loaded Plan List (Excel-style)
  updateMachineTypeOptions() {
    let currentData = this.planList;

    // Extract Unique Divisions directly from loaded data + always include defaults
    const uniqueDivisions = new Set(currentData.map((item: any) => item.division).filter(Boolean));
    const divArray = Array.from(uniqueDivisions);
    if (!divArray.includes('GM')) divArray.push('GM');
    if (!divArray.includes('PMC')) divArray.push('PMC');
    this.divisions = divArray.sort() as string[];

    // If Division is selected, show only MCs in that Division
    if (this.filterDivision && this.filterDivision !== 'All') {
      currentData = currentData.filter((item: any) => item.division === this.filterDivision);
    }

    // Extract Unique Options (Sort alphabetically)
    const uniqueMCs = new Set(currentData.map((item: any) => item.mcType).filter((mc: any) => mc));
    this.machineTypes = Array.from(uniqueMCs).sort() as string[];

    const uniqueFacs = new Set(currentData.map((item: any) => item.fac).filter((fac: any) => fac));
    this.facList = Array.from(uniqueFacs).sort() as string[];

    const uniqueProcesses = new Set(currentData.map((item: any) => item.process).filter((process: any) => process));
    this.processList = Array.from(uniqueProcesses).sort() as string[];

    const uniquePartNos = new Set(currentData.map((item: any) => item.partNo).filter((partNo: any) => partNo));
    this.partNoList = Array.from(uniquePartNos).sort() as string[];

    // STATUS: extract computed badge labels (same as what the badge displays in the table)
    const computedStatuses = new Set<string>();
    currentData.forEach((item: any) => {
      if (item.planStatus === 'Cancelled') {
        computedStatuses.add('Cancelled');
      } else {
        const s = this.getProcessStatus(item);
        if (s?.label) computedStatuses.add(s.label);
      }
    });
    if (computedStatuses.size > 0) {
      this.statusList = Array.from(computedStatuses).sort() as string[];
    }
  }


  checkPrintPermission() {
    const myId = this.currentUser?.Employee_ID;
    if (!myId) return;

    this.historyPrint.checkPrintPermission(myId).subscribe({
      next: (res: any) => {
        this.canPrint = res.allowed;
      },
      error: (err) => console.error("Error checking print permission:", err)
    });
  }

  // --- Datepicker Actions ---
  setToday(picker: MatDatepicker<any> | null) {
    const today = new Date();
    // Fix for Thai Buddhist Calendar
    if (today.getFullYear() > 2500) {
      today.setFullYear(today.getFullYear() - 543);
    }
    this.filterDate = today;
    this.onFilterChange();
    if (picker) picker.close();
  }

  clearDate(picker: MatDatepicker<any> | null) {
    this.filterDate = null;
    this.onFilterChange();
    if (picker) picker.close();
  }

  onFilterChange() {
    this.selectedEnPlanIds.clear();
    this.selectedEnUniqueIds.clear();
    this.currentPage = 1;
    this.loadPlanListPaginated(1);
  }

  // Client-side STATUS filter applied after server data arrives
  applyClientStatusFilter() {
    if (!this.filterStatus || this.filterStatus.length === 0) return; // no filter — nothing to do
    this.filteredPlanList = this.filteredPlanList.filter((item: any) => {
      const label = item.planStatus === 'Cancelled'
        ? 'Cancelled'
        : (this.getProcessStatus(item)?.label || '');
      return (this.filterStatus as string[]).includes(label);
    });
  }

  // ─── Format helper for PC Plan creation timestamp (DateTime_Record) ─────
  formatDateTimeRecord(val: any): string {
    if (!val) return '';
    try {
      // If string, extract date and time directly to preserve exact Thai server time
      // without adding local browser timezone offset (+7 hours)
      if (typeof val === 'string') {
        const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
        if (m) {
          return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
        }
      }
      const d = new Date(val);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = pad(d.getUTCDate());
      const month = pad(d.getUTCMonth() + 1);
      const year = d.getUTCFullYear();
      const hours = pad(d.getUTCHours());
      const minutes = pad(d.getUTCMinutes());
      const seconds = pad(d.getUTCSeconds());
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
      return '';
    }
  }

  // ─── Accordion Grouping: group items by PlanDate ─────────────────────────

  /** Parse a DD/MM/YYYY string to a Date at midnight (local). Returns null on failure. */
  private parseDDMMYYYY(dateStr: string): Date | null {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts.map(Number);
    if (!dd || !mm || !yyyy) return null;
    return new Date(yyyy, mm - 1, dd); // midnight local
  }

  /** Is the given DD/MM/YYYY date in the past (strictly before today)? */
  isDateExpired(dateStr: string): boolean {
    if (!dateStr) return false;
    const cleanDateStr = dateStr.split(' ')[0];
    const d = this.parseDDMMYYYY(cleanDateStr);
    if (!d) return false;
    const today = new Date();
    // Fix for Thai Buddhist Calendar (Year 2569 etc.)
    if (today.getFullYear() > 2500) {
      today.setFullYear(today.getFullYear() - 543);
    }
    today.setHours(0, 0, 0, 0); // normalize to midnight
    return d.getTime() < today.getTime();
  }

  groupPlanList() {
    const groups = new Map<string, any[]>();

    // Expired tasks are ONLY visible on the PC tab — hidden from EN, QC, and all others
    const canSeeExpired = this.canSeeExpiredTasks;

    this.filteredPlanList.forEach(item => {
      const isExpired = this.isDateExpired(item.date);
      const hideExpired = isExpired && !canSeeExpired;
      if (hideExpired) {
        return; // Hide expired items on non-PC/PD tabs
      }

      // Extract timeOnly if available for detail row
      if (item.dateTimeRecordDisplay && item.dateTimeRecordDisplay.includes(' ')) {
        item.timeOnly = item.dateTimeRecordDisplay.split(' ')[1];
      } else {
        item.timeOnly = '';
      }

      // Group by PC plan recording timestamp (DateTime_Record)
      // Fallback to item.date (PlanDate) if DateTime_Record is empty
      // Group by DATE only (same day items grouped together, time shown as sub-label)
      const datePart = item.dateTimeRecordDisplay ? item.dateTimeRecordDisplay.split(' ')[0] : item.date;
      const key = datePart || 'No Date';

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    });

    this.groupedPlanList = Array.from(groups.entries()).map(([key, items]) => {
      let localIdx = 0;

      // ── Expiration check (compares planned setup date against today) ──
      const expDate = items[0]?.date || key;
      const isExpired = this.isDateExpired(expDate);

      // Sort items inside the group chronologically by time
      items.sort((a: any, b: any) => {
        const tA = a.dateTimeRecord || a.dateTimeRecordDisplay || '';
        const tB = b.dateTimeRecord || b.dateTimeRecordDisplay || '';
        return tA.localeCompare(tB);
      });

      items.forEach(item => {
        item._displayIndex = ++localIdx;
        // Stamp each row so detail-row template can read it
        item._isExpired = this.isDateExpired(item.date);
      });
      // Count only active (non-cancelled) items
      const activeItems = items.filter((it: any) => it.planStatus !== 'Cancelled');
      const activeCount = activeItems.length;
      const isAllCancelled = activeCount === 0;

      // Check if finished: all active items must be Complete OR all paths must be Ready
      const isFinished = activeCount > 0 && activeItems.every((it: any) => {
        const reqStr = (it.reqStatus || '').toUpperCase();
        const isRequestComplete = reqStr === 'COMPLETE' || reqStr === 'COMPLETED' || it.isFullyCompleted;
        const isPathReady = it.computedStatus === 'READY';
        return isRequestComplete || isPathReady;
      });

      // Build summary: unique part numbers from active items (max 3)
      const sourceParts = activeCount > 0 ? activeItems : items;
      const uniqueParts = [...new Set(sourceParts.map((it: any) => it.partNo).filter((p: any) => p))];
      const summaryParts = uniqueParts.slice(0, 3).join(', ') + (uniqueParts.length > 3 ? ` +${uniqueParts.length - 3}` : '');
      const candidateList = activeCount > 0 ? activeItems : items;
      const itemWithRev = candidateList.find((it: any) => this.getItemRev(it) !== '-');
      const firstItem = itemWithRev || candidateList[0] || {};
      const groupRev = this.getItemRev(firstItem);
      const groupRevTooltip = this.getRevTooltip(firstItem);

      // Build time sub-display for all departments
      const times = items
        .map((it: any) => it.timeOnly || (it.dateTimeRecordDisplay && it.dateTimeRecordDisplay.includes(' ') ? it.dateTimeRecordDisplay.split(' ')[1] : ''))
        .filter((t: string) => !!t);
      const uniqueTimes = [...new Set(times)];
      const allTimes = uniqueTimes.join(', ');
      let timeDisplay = '';
      if (uniqueTimes.length === 1) {
        timeDisplay = uniqueTimes[0];
      } else if (uniqueTimes.length === 2) {
        timeDisplay = `${uniqueTimes[0]}, ${uniqueTimes[1]}`;
      } else if (uniqueTimes.length > 2) {
        timeDisplay = `${uniqueTimes[0]} - ${uniqueTimes[uniqueTimes.length - 1]} (${uniqueTimes.length} times)`;
      }

      return {
        key,
        date: key,
        items,
        orderCount: activeCount,
        totalCount: items.length,
        isAllCancelled,
        isFinished,
        isExpired,
        summaryParts,
        rev: groupRev,
        revTooltip: groupRevTooltip,
        timeDisplay,
        allTimes
      };
    });

    // ── Sort groupedPlanList from oldest date/time to newest date/time (ASC: e.g. 17 -> 18 -> ... -> 30) ──
    const getGroupTime = (group: any): number => {
      const firstItem = group.items?.[0];
      if (firstItem?.dateTimeRecord) {
        const val = firstItem.dateTimeRecord;
        if (typeof val === 'string') {
          const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
          if (m) {
            return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).getTime();
          }
        }
        const t = new Date(val).getTime();
        if (!isNaN(t)) return t;
      }
      const dateStr = firstItem?.date || group.date;
      if (dateStr) {
        const cleanDateStr = dateStr.split(' ')[0];
        const d = this.parseDDMMYYYY(cleanDateStr);
        if (d) return d.getTime();
      }
      return 0;
    };

    this.groupedPlanList.sort((a, b) => {
      const diff = getGroupTime(a) - getGroupTime(b);
      if (diff !== 0) return diff;
      return (a.key || '').localeCompare(b.key || '');
    });
  }

  toggleGroup(key: string) {
    if (this.expandedGroups.has(key)) {
      this.expandedGroups.delete(key);
    } else {
      this.expandedGroups.add(key);
    }
  }

  isGroupExpanded(key: string): boolean {
    return this.expandedGroups.has(key);
  }

  expandAllGroups() {
    this.groupedPlanList.forEach(g => this.expandedGroups.add(g.key));
  }

  collapseAllGroups() {
    this.expandedGroups.clear();
  }

  // loadPlanList() removed in favor of Server-Side Pagination

  // ─── Server-Side Pagination: Push params to switchMap trigger ────────────
  loadPlanListPaginated(page: number = this.currentPage) {
    this.currentPage = page;
    const filterDateStr = this.filterDate
      ? `${this.filterDate.getFullYear()}-${String(this.filterDate.getMonth() + 1).padStart(2, '0')}-${String(this.filterDate.getDate()).padStart(2, '0')}`
      : null;

    let targetDept = this.selectedDepartment;
    let targetSubTab = this.selectedSubTab || 'ALL';

    if (this.selectedDepartment === 'PD') {
      targetDept = 'PC';
    }

    // EN TAB now uses server-side Required filtering based on persisted Path_Dwg and Path_Layout

    this.loadTrigger$.next({
      page: this.currentPage,
      pageSize: this.pageSize,
      department: targetDept,
      subTab: targetSubTab,
      showHistory: this.showHistory,
      filterDate: filterDateStr,
      filterMachine: this.filterMachineType?.length ? this.filterMachineType.join(',') : null,
      filterFac: this.filterFac?.length ? this.filterFac.join(',') : null,
      filterProcess: this.filterProcess?.length ? this.filterProcess.join(',') : null,
      filterPartNo: this.filterPartNo?.length ? this.filterPartNo.join(',') : null,
      filterDivision: (this.filterDivision && this.filterDivision !== 'All') ? this.filterDivision : null
    });
    // console.log('[PlanList] Loading paginated data:', {
    //   dept: this.selectedDepartment,
    //   tab: this.selectedSubTab,
    //   div: this.filterDivision,
    //   sentDiv: (this.filterDivision && this.filterDivision !== 'All') ? this.filterDivision : null
    // });
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.loadPlanListPaginated(page);
  }

  nextPage() { this.goToPage(this.currentPage + 1); }
  prevPage() { this.goToPage(this.currentPage - 1); }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Filter logic handled entirely on the server now. applyFilter() decommissioned.

  // Helper สำหรับเช็ควันที่
  isDateMatch(itemDateStr: string, filterDateObj: Date | null): boolean {
    if (!itemDateStr || !filterDateObj) return false;

    // itemDateStr: dd/mm/yyyy
    // filterDateObj: Date Object from p-calendar

    const parts = itemDateStr.split('/');
    if (parts.length !== 3) return false;

    const [day, month, year] = parts.map(Number);
    // Create Date from item string (Local time assumed for date parts)
    // Note: Creating date with (year, monthIndex, day)

    // Compare logic:
    // filterDateObj is a Date object.

    // Simplest way: Compare d/m/y parts
    return day === filterDateObj.getDate() &&
      (month - 1) === filterDateObj.getMonth() &&
      year === filterDateObj.getFullYear();
  }

  // --- Revision Display Logic ---
  getItemRev(item: any): string {
    if (!item) return '-';
    const dwgRev = (item.pathDwgRev ?? item.Path_Dwg_Rev ?? '').toString().trim();
    const layoutRev = (item.pathLayoutRev ?? item.Path_Layout_Rev ?? '').toString().trim();

    if (dwgRev && layoutRev) {
      return dwgRev === layoutRev ? dwgRev : `${dwgRev} / ${layoutRev}`;
    }
    if (dwgRev) return dwgRev;
    if (layoutRev) return layoutRev;

    const planRev = item.revision ?? item.Revision;
    if (planRev !== undefined && planRev !== null && String(planRev).trim() !== '' && String(planRev).trim() !== '0') {
      return `Rev.${planRev}`;
    }
    return '-';
  }

  getRevTooltip(item: any): string {
    if (!item) return '';
    const dwgRev = (item.pathDwgRev ?? item.Path_Dwg_Rev ?? '').toString().trim();
    const layoutRev = (item.pathLayoutRev ?? item.Path_Layout_Rev ?? '').toString().trim();
    const parts: string[] = [];
    if (dwgRev) parts.push(`DWG Rev: ${dwgRev}`);
    if (layoutRev) parts.push(`Layout Rev: ${layoutRev}`);
    const planRev = item.revision ?? item.Revision;
    if (planRev !== undefined && planRev !== null && String(planRev).trim() !== '') {
      parts.push(`Plan Rev: ${planRev}`);
    }
    return parts.join(' | ');
  }

  // --- Process Status Logic ---
  getProcessStatus(item: any): { status: string, color: string, label: string } {
    const hasDwg = item.pathDwg && item.pathDwg !== '-' && item.pathDwg.trim() !== '';
    const hasLayout = item.pathLayout && item.pathLayout !== '-' && item.pathLayout.trim() !== '';
    const dwgSrc = item.drawingSource || item.Path_Dwg_Source;
    const layoutSrc = item.layoutSource || item.Path_Layout_Source;

    const comment = (item.comment || '').toLowerCase();
    const partNo = (item.partNo || '').toLowerCase();
    const isTest = comment.includes('test') || partNo.includes('test');

    const isDwgDone = hasDwg && (dwgSrc === 'manual' || isTest);
    const isLayoutDone = hasLayout && (layoutSrc === 'manual' || isTest);
    const isEnDone = isDwgDone && isLayoutDone;
    const hasQC = item.iiqc && item.iiqc !== '-' && item.iiqc.trim() !== '';

    let s = 'READY';
    if (!isEnDone && !hasQC) s = 'WAIT_BOTH';
    else if (!isEnDone) s = 'WAIT_ENG';
    else if (!hasQC) s = 'WAIT_QC';
    item.computedStatus = s;

    if (s === 'WAIT_BOTH') return { status: 'WAIT_BOTH', color: 'badge-wait-both', label: 'WAIT EN & QC' };
    if (s === 'WAIT_ENG') return { status: 'WAIT_ENG', color: 'badge-wait-eng', label: 'WAIT EN' };
    if (s === 'WAIT_QC') return { status: 'WAIT_QC', color: 'badge-wait-qc', label: 'WAIT QC' };
    return { status: 'READY', color: 'badge-ready', label: 'READY' };
  }

  // --- Request Navigation ---
  onRequest(item: any) {
    // console.log('Navigating to Request with item:', item);

    // Prepare Query Params
    const queryParams: any = {
      case: 'SET', // Force SET case
      division: item.division,
      fac: item.fac,
      partNo: item.partNo,
      process: item.process,
      mc: item.mcType,
      mcNo: item.mcNo,
      qty: item.qty,
      fromPlan: 'true',
      date: item.date, // Pass date to Request
      Unique_Id: item.Unique_Id ? `PLAN-${item.Unique_Id}` : null,  // Carry Unique_Id (re-add prefix for display)
      pathLayout: item.pathLayout || ''
    };

    this.router.navigate(['/production/request'], { queryParams: queryParams });
  }

  // --- Return Navigation (Smart: Uses queryParams - same proven pattern as onRequest) ---
  onReturnWithItems(item: any) {
    // console.log('Navigating to Return with item:', item);

    if (!item.Unique_Id) {
      // No Unique_Id: fallback to plain navigation
      this.router.navigate(['/production/return']);
      return;
    }

    // Show loading indicator
    Swal.fire({
      title: 'Loading Items...',
      text: 'Fetching completed items for return.',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const apiUrl = `${environment.apiUrl}/get_ToolingRequest_ByUniqueId`;
    this.http.post<any>(apiUrl, { uniqueId: item.Unique_Id }).subscribe({
      next: (result) => {
        Swal.close();
        const allItems = [...(result.cuttingTool || []), ...(result.setupTool || [])];
        // Filter only Complete items and extract their ItemNo
        const completeItemNos: string[] = allItems
          .filter((r: any) => {
            const stat = (r.Status || '').trim().toLowerCase();
            return stat === 'complete' || stat === 'completed' || stat === 'finished';
          })
          .map((r: any) => r.ItemNo)
          .filter((n: string) => !!n);

        // Use queryParams — the same proven pattern used by onRequest()
        const queryParams: any = {
          uniqueId: item.Unique_Id,
          itemNos: completeItemNos.join(','), // Serialize array as comma-delimited string
          division: item.divisionCode || item.division,
          fac: item.fac,
          process: item.process
        };

        this.router.navigate(['/production/return'], { queryParams });
      },
      error: (err) => {
        console.error('Failed to fetch tooling items for return:', err);
        Swal.close();
        this.router.navigate(['/production/return']);
      }
    });
  }

  // --- OK Button Handler (Return sub-tab) ---
  onMarkOK(item: any) {
    if (!item.Unique_Id) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'No Unique_Id found.' });
      return;
    }

    const customStyles = `
      <style>
        .swal-ok-modern-popup {
          border-radius: 16px !important;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04) !important;
          padding-bottom: 24px !important;
        }
        .swal-ok-modern-title {
          font-size: 1.4rem !important;
          font-weight: 700 !important;
          color: #1e293b !important;
        }
        .swal-ok-modern-html {
          font-size: 1rem !important;
          line-height: 1.6 !important;
          color: #475569 !important;
        }
        .swal-btn-ok-rounded {
          border-radius: 8px !important;
          padding: 10px 24px !important;
          font-weight: 600 !important;
          letter-spacing: 0.025em !important;
        }
      </style>
    `;

    Swal.fire({
      icon: 'question',
      title: '<span class="swal-ok-modern-title">Mark as OK?</span>',
      html: `${customStyles}
        <div class="swal-ok-modern-html">
          ยืนยันว่าการ Return ของ <b>${item.partNo || '-'}</b> เสร็จสมบูรณ์แล้วใช่หรือไม่?
        </div>`,
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Yes, Confirm',
      cancelButtonText: 'Go back',
      customClass: {
        popup: 'swal-ok-modern-popup',
        confirmButton: 'swal-btn-ok-rounded',
        cancelButton: 'swal-btn-ok-rounded'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        // Optimistic UI: immediately remove from Return sub-tab view BEFORE server responds
        this.filteredPlanList = this.filteredPlanList.filter((r: any) => r.Unique_Id !== item.Unique_Id);
        this.cdr.markForCheck();

        // Optional non-blocking toast
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Removed from Return view',
          showConfirmButton: false,
          timer: 1500
        });

        // Silently execute backend call in the background
        const apiUrl = `${environment.apiUrl}/return/link-plan-ok`;
        this.http.post(apiUrl, { uniqueId: item.Unique_Id }).subscribe({
          next: () => {
            // Already removed perfectly via Optimistic UI; SSE will sync other clients in background
          },
          error: (err) => {
            console.error('Failed to mark OK in background:', err);
            Swal.fire({
              toast: true, position: 'top-end', icon: 'error',
              title: 'Sync Error', text: 'Server failed to record action.', showConfirmButton: false, timer: 3000
            });
          }
        });
      }
    });
  }

  onAdd() {
    this.editData = {
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      dateObj: new Date(),
      division: this.filterDivision && this.filterDivision !== 'All' ? this.filterDivision : 'PMC', // Default to current filter or PMC
      divisionCode: this.filterDivision === 'GM' ? '7122' : '71DZ', // Map correctly based on choice
      mcType: '',
      barType: '',
      fac: '',
      partBefore: '',
      mcNo: '',
      partNo: '',
      qty: 0,
      time: '',
      comment: '',
      pathDwg: '',
      pathLayout: '',
      iiqc: '',
      revision: 0,
      planStatus: 'Active',
      groupId: '-', // Special marker for new plan
      isNew: true
    };

    // Populate dropdowns first — isEditModalOpen is set inside the API callback
    // to avoid the flash where the modal renders before dropdown data arrives.
    const divisionId = this.getDivisionIdForApi(this.editData);
    this.populateModalDropdowns(divisionId);
  }

  isEditModalOpen: boolean = false;
  editData: any = {};

  onEdit(item: any) {
    if (this.selectedDepartment === 'EN' && this.selectedSubTab === 'Required') {
      if (this.getSelectedEnCount() > 0 && this.isEnRowSelected(item)) {
        this.isEnBatchMode = true;
        this.enBatchItems = (this.filteredPlanList || []).filter((it: any) => this.isEnRowSelected(it));
      } else if (!this.isEnBatchMode) {
        this.isEnBatchMode = false;
        this.enBatchItems = [];
      }
    } else {
      this.isEnBatchMode = false;
      this.enBatchItems = [];
    }

    const startTime = Date.now();

    // Show unified loading indicator covering BOTH API calls
    Swal.fire({
      title: 'Loading Plan...',
      text: 'กำลังเตรียมความพร้อมของข้อมูล',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    if (this.selectedDepartment !== 'PC' || !item.Unique_Id) {
      this.openEditModalInternal(item, false, startTime);
      return;
    }

    const apiUrl = `${environment.apiUrl}/get_ToolingRequest_ByUniqueId`;
    this.http.post<any>(apiUrl, { uniqueId: item.Unique_Id }).subscribe({
      next: (result) => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 300 - elapsed);

        setTimeout(() => {
          const allRequests = [...(result.cuttingTool || []), ...(result.setupTool || [])];

          // 1. Check if ANY request is Complete or Waiting
          const hasComplete = allRequests.some(req => (req.Status || '').toLowerCase() === 'complete' || (req.Status || '').toLowerCase() === 'completed');
          const hasWaiting = allRequests.some(req => (req.Status || '').toLowerCase() === 'waiting' || (req.Status || '').toLowerCase() === 'in progress');

          if (hasComplete || hasWaiting) {
            // Select message based on status (Prioritize 'Complete' message if both present)
            const restrictedMessage = hasComplete
              ? 'Purchase ได้ดำเนินการหรือกำลังเตรียมการสำหรับแผนงานนี้แล้ว จึงไม่อนุญาตให้แก้ไขข้อมูลในส่วนสำคัญ'
              : 'Production ได้ดำเนินการเบิก Tooling สำหรับแผนงานนี้แล้ว จึงไม่อนุญาตให้แก้ไขข้อมูลในส่วนสำคัญ';

            // This warning overrides the Loading Swal seamlessly
            Swal.fire({
              icon: 'warning',
              title: 'Edit Restricted',
              text: restrictedMessage,
              confirmButtonText: 'Understood',
              confirmButtonColor: '#3085d6'
            }).then(() => {
              // Now user clicked 'Understood'
              // We must pop the Loader back up to hide the blank wait state while getting dropdowns
              Swal.fire({
                title: 'Loading Plan...',
                text: 'กำลังเตรียมความพร้อมของข้อมูล',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
              });

              // We pass a new startTime since the user had to interact
              this.openEditModalInternal(item, true, Date.now());
            });
          }
          else {
            // Normal edit: Do NOT close Swal yet; let the second API (dropdowns) run under the same loader
            this.openEditModalInternal(item, false, startTime);
          }
        }, remaining);
      },
      error: (err) => {
        console.error('API Error checking status', err);
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 300 - elapsed);
        setTimeout(() => {
          // Fallback to open normally if API fails
          this.openEditModalInternal(item, false, startTime);
        }, remaining);
      }
    });
  }

  private openEditModalInternal(item: any, forceLock: boolean = false, startTime: number = 0) {
    this.editData = { ...item }; // Clone data
    if (forceLock) {
      this.editData.statusToPH = 'Complete';
    }

    this.editData.originalItem = { ...item }; // Keep original for comparison

    // Strip hyphens and accidental quotes from paths for easier editing
    const cleanPath = (p: string) => (p || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    this.editData.pathDwg = cleanPath(this.editData.pathDwg === '-' ? '' : this.editData.pathDwg);
    this.editData.pathLayout = cleanPath(this.editData.pathLayout === '-' ? '' : this.editData.pathLayout);
    this.editData.iiqc = cleanPath(this.editData.iiqc === '-' ? '' : this.editData.iiqc);

    // BUG 1 FIX: Intelligently guess the source for legacy data where DB source is NULL.
    // Auto-generated paths from the system end specifically with '\DWG' or '\LAYOUT'.
    // If EN pasted a general path like '\\pbgm06\D\PartEN PMC\Process', it won't match this and will correctly show as MANUAL.
    const dwgStr = (this.editData.pathDwg || '').trim().toLowerCase();
    const isStandardDwg = dwgStr.includes('process dwg') || dwgStr.includes('pmc parts') || dwgStr.includes('\\dwg');

    const layoutStr = (this.editData.pathLayout || '').trim().toLowerCase();
    const isStandardLayout = layoutStr.includes('layout') || layoutStr.includes('process dwg') || layoutStr.includes('pmc parts');

    this.editData.drawingSource = item.drawingSource || item.Path_Dwg_Source || (this.editData.pathDwg ? (isStandardDwg ? 'auto' : 'manual') : 'manual');
    this.editData.layoutSource = item.layoutSource || item.Path_Layout_Source || (this.editData.pathLayout ? (isStandardLayout ? 'auto' : 'manual') : 'manual');

    // Determine context based on selectedDepartment
    this.enAutoPathLoading = false;
    this.editData.context = this.selectedDepartment;

    // Initialize EN Attachments
    this.enDwgPaths = [this.editData.pathDwg || ''];
    const dwgRev = (item.pathDwgRev !== undefined && item.pathDwgRev !== null)
      ? String(item.pathDwgRev).trim()
      : ((item.Path_Dwg_Rev !== undefined && item.Path_Dwg_Rev !== null) ? String(item.Path_Dwg_Rev).trim() : '');
    this.enDwgRevs = [dwgRev];

    this.enLayoutPaths = [this.editData.pathLayout || ''];
    const layoutRev = (item.pathLayoutRev !== undefined && item.pathLayoutRev !== null)
      ? String(item.pathLayoutRev).trim()
      : ((item.Path_Layout_Rev !== undefined && item.Path_Layout_Rev !== null) ? String(item.Path_Layout_Rev).trim() : '');
    this.enLayoutRevs = [layoutRev];

    // Auto-populate Quantity from MC.QTY of the selected item(s)
    let calculatedMcQty: number | null = null;
    if (this.selectedEnPlanIds && (this.selectedEnPlanIds.size > 0 || this.selectedEnUniqueIds.size > 0)) {
      const selectedItems = (this.filteredPlanList || []).filter((it: any) => this.isEnRowSelected(it));
      if (selectedItems.length > 0) {
        const total = selectedItems.reduce((acc: number, it: any) => {
          const q = Number(it.mcQty ?? it.MC_QTY ?? it.MC_Qty ?? 0);
          return acc + (isNaN(q) || q <= 0 ? 1 : q);
        }, 0);
        if (total > 0) calculatedMcQty = total;
      }
    }

    if (calculatedMcQty === null) {
      const directQty = Number(item.mcQty ?? item.MC_QTY ?? item.MC_Qty);
      if (!isNaN(directQty) && directQty > 0) {
        calculatedMcQty = directQty;
      } else if (item.mcNo && typeof item.mcNo === 'string' && item.mcNo.trim() !== '' && item.mcNo !== '-') {
        const mcCount = item.mcNo.split(/[,/]+/).map((s: string) => s.trim()).filter((s: string) => s && s !== '-').length;
        if (mcCount > 0) calculatedMcQty = mcCount;
      }
    }

    this.enDwgQty = calculatedMcQty;
    this.enLayoutQty = calculatedMcQty;

    // Format Date for p-calendar (Date object)
    if (this.editData.date) {
      const parts = this.editData.date.split('/');
      if (parts.length === 3) {
        // parts: [dd, mm, yyyy] -> new Date(yyyy, mm-1, dd)
        this.editData.dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
    }

    // Populate dropdowns first, then open the modal inside the callback.
    // This prevents a brief flash where the modal renders with empty ng-select dropdowns
    // before the API response arrives (race condition fix).
    const divisionId = this.getDivisionIdForApi(this.editData);
    this.populateModalDropdowns(divisionId, startTime);
    // isEditModalOpen is now set inside populateModalDropdowns' next/error handlers.
  }

  trackByIndex(index: number): number {
    return index;
  }

  addDwgPath(): void {
    this.enDwgPaths.push('');
  }

  removeDwgPath(idx: number): void {
    if (this.enDwgPaths.length > 1) {
      this.enDwgPaths.splice(idx, 1);
    } else {
      this.enDwgPaths[0] = '';
    }
    this.syncEnPaths();
  }

  addDwgRev(): void {
    this.enDwgRevs.push('0');
  }

  removeDwgRev(idx: number): void {
    if (this.enDwgRevs.length > 1) {
      this.enDwgRevs.splice(idx, 1);
    }
  }

  addLayoutPath(): void {
    this.enLayoutPaths.push('');
  }

  removeLayoutPath(idx: number): void {
    if (this.enLayoutPaths.length > 1) {
      this.enLayoutPaths.splice(idx, 1);
    } else {
      this.enLayoutPaths[0] = '';
    }
    this.syncEnPaths();
  }

  addLayoutRev(): void {
    this.enLayoutRevs.push('0');
  }

  removeLayoutRev(idx: number): void {
    if (this.enLayoutRevs.length > 1) {
      this.enLayoutRevs.splice(idx, 1);
    }
  }

  syncEnPaths(): void {
    const clean = (p: string) => (p || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    const rawDwg = this.enDwgPaths.find(p => p && p.trim() !== '');
    const rawLayout = this.enLayoutPaths.find(p => p && p.trim() !== '');
    this.editData.pathDwg = rawDwg ? clean(rawDwg) : '';
    this.editData.pathLayout = rawLayout ? clean(rawLayout) : '';
  }

  clearEnModal(): void {
    this.enDwgPaths = [''];
    this.enDwgRevs = [''];
    this.enDwgQty = null;
    this.enLayoutPaths = [''];
    this.enLayoutRevs = [''];
    this.enLayoutQty = null;
    this.syncEnPaths();
  }

  onEnMcQtyChange(source: 'dwg' | 'layout', val: number): void {
    if (source === 'dwg') {
      this.enLayoutQty = val;
    } else {
      this.enDwgQty = val;
    }
  }

  previewEnFile(type: string): void {
    const p = type === 'DRAWING' ? this.editData.pathDwg : this.editData.pathLayout;
    if (p && p.trim() !== '' && p !== '-') {
      this.openFile(p, this.editData.requestNo || this.editData.groupId);
    } else {
      Swal.fire({
        icon: 'info',
        title: `Preview ${type}`,
        text: `ยังไม่มี Path สำหรับ ${type}`,
        timer: 2000,
        showConfirmButton: false
      });
    }
  }

  // ── Helper methods to filter UI web page display for EN Path icons ──
  shouldShowDwgIcon(item: any): boolean {
    if (!item || !item.pathDwg || item.pathDwg.trim() === '' || item.pathDwg.trim() === '-') {
      return false;
    }
    const comment = (item.comment || '').toLowerCase();
    const partNo = (item.partNo || '').toLowerCase();
    const isTest = comment.includes('test') || partNo.includes('test');
    if (isTest) return true;

    const source = item.drawingSource || item.Path_Dwg_Source;
    return source === 'manual';
  }

  shouldShowLayoutIcon(item: any): boolean {
    if (!item || !item.pathLayout || item.pathLayout.trim() === '' || item.pathLayout.trim() === '-') {
      return false;
    }
    const comment = (item.comment || '').toLowerCase();
    const partNo = (item.partNo || '').toLowerCase();
    const isTest = comment.includes('test') || partNo.includes('test');
    if (isTest) return true;

    const source = item.layoutSource || item.Path_Layout_Source;
    return source === 'manual';
  }

  // ── Auto-find PDF paths on the network share and auto-save when found ──────
  autoFindAndSavePath(item: any = this.editData) {
    const partNo = item.partNo || '';
    const mcNo = item.mcNo || '';
    if (!partNo && !mcNo) return;

    this.enAutoPathLoading = true;
    const params = new URLSearchParams();
    if (partNo) params.set('partNo', partNo);
    if (mcNo) params.set('mcNo', mcNo);

    this.http.get<any>(`${environment.apiUrl}/en-sync/auto-path?${params.toString()}`).subscribe({
      next: (res) => {
        this.enAutoPathLoading = false;
        if (!res.autoFound) {
          this.cdr.markForCheck();
          return;
        }

        const normalize = (p: string) => p ? p.trim().toLowerCase().replace(/\\/g, '/') : '';
        let changed = false;

        // Store API URL (used for print preview) but save absolute path to DB
        if (res.pathDwg && this.editData.drawingSource !== 'manual') {
          const autoPathDwg = res.absPathDwg || res.pathDwg;
          if (!this.editData.pathDwg || this.editData.pathDwg === '-') {
            this.editData.pathDwg = autoPathDwg;
            this.editData._pathDwgApiUrl = res.pathDwg;
            this.editData.drawingSource = 'auto';
            changed = true;
          } else if (normalize(this.editData.pathDwg) === normalize(autoPathDwg)) {
            // Already filled, but matches exactly what the system found -> mark as AUTO
            this.editData.drawingSource = 'auto';
            this.editData._pathDwgApiUrl = res.pathDwg;
          }
        }

        if (res.pathLayout && this.editData.layoutSource !== 'manual') {
          const autoPathLayout = res.absPathLayout || res.pathLayout;
          if (!this.editData.pathLayout || this.editData.pathLayout === '-') {
            this.editData.pathLayout = autoPathLayout;
            this.editData._pathLayoutApiUrl = res.pathLayout;
            this.editData.layoutSource = 'auto';
            changed = true;
          } else if (normalize(this.editData.pathLayout) === normalize(autoPathLayout)) {
            // Already filled, but matches exactly what the system found -> mark as AUTO
            this.editData.layoutSource = 'auto';
            this.editData._pathLayoutApiUrl = res.pathLayout;
          }
        }
        this.cdr.markForCheck();

        // Auto-save silently if we found at least one path and the fields were empty before
        if (changed) {
          const pathPayload = {
            groupId: this.editData.groupId,
            pathDwg: this.editData.pathDwg,
            pathLayout: this.editData.pathLayout,
            iiqc: this.editData.iiqc,
            pathDwgSource: this.editData.drawingSource,
            pathLayoutSource: this.editData.layoutSource
          };
          this.pcPlanService.updatePaths(pathPayload).subscribe({
            next: () => {
              this.editData.originalItem = { ...this.editData.originalItem, pathDwg: this.editData.pathDwg, pathLayout: this.editData.pathLayout };
              this.loadPlanListPaginated(this.currentPage);
              this.cdr.markForCheck();
            },
            error: (err) => console.error('[EN AUTO-PATH SAVE ERROR]', err)
          });
        }
      },
      error: (err) => {
        this.enAutoPathLoading = false;

        if (err?.status === 504 || err?.error?.error?.includes('timed out')) {
          Swal.fire({
            title: 'Scan Timed Out',
            text: 'The automatic scan took too long. Please enter the path manually.',
            icon: 'warning'
          });
          console.warn('[EN AUTO-PATH] Scan timed out:', err?.message);
        } else {
          console.warn('[EN AUTO-PATH] Could not find file in local uploads folder:', err?.message);
        }

        this.cdr.markForCheck();
      }
    });
  }

  // Called when user manually edits a path field — mark field as manual (red)
  onPathFieldManualInput(field: 'dwg' | 'layout') {
    if (field === 'dwg') this.editData.drawingSource = 'manual';
    if (field === 'layout') this.editData.layoutSource = 'manual';
  }

  // --- API Dropdown Mapping Helpers ---
  getDivisionIdForApi(item: any): string {
    const div = item.divisionCode || item.division || '';
    if (div === '2' || div.toUpperCase() === 'PMC' || div === '71DZ') return '2';
    if (div === '3' || div.toUpperCase() === 'GM' || div === '71D1') return '3';
    return '2'; // Default to PMC
  }

  populateModalDropdowns(divisionId: string, startTime: number = 0) {
    this.pcPlanService.getMasterData(divisionId).subscribe({
      next: (res) => {
        // Map Result Set 1 (MC Type & Bar Type)
        if (res.machines && res.machines.length > 0) {
          const uniqueMcs = new Set<string>(res.machines.map((m: any) => m.MC || m.MC_Type).filter((v: any) => v));
          this.modalMachineTypes = Array.from(uniqueMcs).sort();
          this.modalBarTypeList = Array.from(uniqueMcs).sort(); // Sharing the same list per requirement
        } else {
          this.modalMachineTypes = [];
          this.modalBarTypeList = [];
        }

        // Map Result Set 2 (Facility)
        // Note: New SP [Stored_Get_Dropdown_Facility_By_Division] returns FacilityShort, FacilityName
        if (res.facilities && res.facilities.length > 0) {
          const uniqueFacs = new Set<string>(res.facilities.map((f: any) => f.FacilityShort || f.FacilityName).filter((v: any) => v));
          this.modalFacList = Array.from(uniqueFacs).sort();
        } else {
          this.modalFacList = [];
        }

        // Map Result Set 3 (Process)
        if (res.processes && res.processes.length > 0) {
          const uniqueProcs = new Set<string>(res.processes.map((p: any) => p.Process).filter((v: any) => v));
          this.modalProcessList = Array.from(uniqueProcs).sort();
        } else {
          this.modalProcessList = [];
        }

        // Map Result Set 4 (PartNo & PartBefore)
        if (res.partNos && res.partNos.length > 0) {
          const uniqueParts = new Set<string>(res.partNos.map((p: any) => p.PartNo).filter((v: any) => v));
          this.modalPartNoList = Array.from(uniqueParts).sort();
          this.modalPartBeforeList = Array.from(uniqueParts).sort();
        } else {
          this.modalPartNoList = [];
          this.modalPartBeforeList = [];
        }

        // Enforce 300ms minimum loading time to avoid flickering
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 300 - elapsed);

        setTimeout(() => {
          if (Swal.isVisible() && Swal.getTitle()?.textContent === 'Loading Plan...') {
            Swal.close();
          }
          this.isEditModalOpen = true;
          this.cdr.markForCheck();
        }, remaining);
      },
      error: (err) => {
        console.error('Failed to load modal dropdown master data:', err);
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 300 - elapsed);

        setTimeout(() => {
          if (Swal.isVisible() && Swal.getTitle()?.textContent === 'Loading Plan...') {
            Swal.close();
          }
          this.isEditModalOpen = true;
          this.cdr.markForCheck();
        }, remaining);
      }
    });
  }

  onCancel(item: any) {
    if (this.selectedDepartment !== 'PC' || !item.Unique_Id) {
      this.executeNormalCancelPrompt(item);
      return;
    }

    // Show loading indicator while checking backend statuses across Request tables
    Swal.fire({
      title: 'Checking Status...',
      text: 'Please wait while we verify the request status.',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const apiUrl = `${environment.apiUrl}/get_ToolingRequest_ByUniqueId`;
    this.http.post<any>(apiUrl, { uniqueId: item.Unique_Id }).subscribe({
      next: (result) => {
        Swal.close();
        const allRequests = [...(result.cuttingTool || []), ...(result.setupTool || [])];

        // If no requests exist for this Unique_Id, proceed with normal Cancel workflow
        if (allRequests.length === 0) {
          this.executeNormalCancelPrompt(item);
          return;
        }

        const isWaiting = (req: any) => {
          const s = (req.Status || '').toLowerCase();
          return s === 'waiting' || s === 'in progress';
        };

        const isComplete = (req: any) => {
          const s = (req.Status || '').toLowerCase();
          return s === 'complete' || s === 'completed';
        };

        const hasWaiting = allRequests.some(isWaiting);
        const hasComplete = allRequests.some(isComplete);

        // ─── Case 2: At least one item is 'Complete' ──────────────────────────
        if (hasComplete) {
          Swal.fire({
            title: 'Cancellation',
            html: `
              <p style="font-size:1rem;color:#334155;margin-bottom:0.5rem;">
                Purchase กำลังดำเนินงาน คุณต้องการยกเลิกแผนงานนี้ใช่หรือไม่
              </p>
              <p style="font-size:0.85rem;color:#ef4444;font-weight:600;">
                หลังจาก Cancel แผนงานนี้ รบกวน Production Return ของกลับด้วยครับ
              </p>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes',
            cancelButtonText: 'No'
          }).then((result) => {
            if (result.isConfirmed) this.executeCancelApi(item);
          });
          return;
        }

        // ─── Case 1: All items are 'Waiting' ─────────────────────────────────
        if (hasWaiting) {
          Swal.fire({
            title: 'Cancellation',
            html: `
              <p style="font-size:1rem;color:#334155;">
                แผนงานนี้ Production ได้ทำการส่งคำขอ Request Tooling เรียบร้อยแล้ว
                คุณต้องการยกเลิกแผนงานใช่หรือไม่
              </p>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes',
            cancelButtonText: 'No'
          }).then((result) => {
            if (result.isConfirmed) this.executeCancelApi(item);
          });
          return;
        }

        // No active requests — normal cancellation prompt
        this.executeNormalCancelPrompt(item);
      },
      error: (err) => {
        console.error('API Error checking status', err);
        Swal.close();
        // Fallback to normal prompt if API fails to avoid completely blocking the user
        this.executeNormalCancelPrompt(item);
      }
    });
  }

  private executeCancelApi(item: any) {
    let dateObj = '';
    if (item.date) {
      const parts = item.date.split('/');
      if (parts.length === 3) {
        dateObj = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    const payload = [{
      date: dateObj,
      employeeId: item.empId || this.currentUser?.Employee_ID || 'SYSTEM',
      division: item.divisionCode || item.division,
      mcType: item.mcType,
      fac: item.fac,
      partBefore: item.partBefore,
      mcNo: item.mcNo,
      partNo: item.partNo,
      process: item.process,
      qty: item.qty,
      time: item.time,
      comment: item.comment,
      pathDwg: item.pathDwg === '-' ? '' : item.pathDwg,
      pathLayout: item.pathLayout === '-' ? '' : item.pathLayout,
      iiqc: item.iiqc === '-' ? '' : item.iiqc,
      groupId: item.groupId,
      revision: (item.revision || 0) + 1,
      planStatus: 'Cancelled',
      uniqueId: item.Unique_Id || null
    }];

    this.pcPlanService.savePlan(payload).subscribe({
      next: (res) => {
        Swal.fire('Cancelled!', 'ทำรายการเสร็จเรียบร้อยแล้วครับ', 'success');
        this.loadPlanListPaginated(this.currentPage);
      },
      error: (err) => {
        console.error('Cancel Error:', err);
        Swal.fire('Error', 'ทำรายการไม่สำเร็จครับ', 'error');
      }
    });
  }

  private executeNormalCancelPrompt(item: any) {
    const customStyles = `
      <style>
        .swal-cancel-modern-popup {
          border-radius: 16px !important;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
          padding-bottom: 24px !important;
        }
        .swal-cancel-modern-title {
          font-size: 1.5rem !important;
          font-weight: 700 !important;
          color: #1e293b !important;
          margin-bottom: 12px !important;
        }
        .swal-cancel-modern-html {
          font-size: 1.05rem !important;
          line-height: 1.5 !important;
          color: #334155 !important;
        }
        .swal-btn-rounded {
          border-radius: 8px !important;
          padding: 10px 24px !important;
          font-weight: 600 !important;
          letter-spacing: 0.025em !important;
        }
      </style>
    `;

    Swal.fire({
      title: 'Cancellation Warning',
      html: `${customStyles}<div class="swal-cancel-modern-html"><div style="text-align: center;">คุณต้องการยกเลิกแผนงานนี้หรือไม่?</div></div>`,
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
    }).then((result) => {
      if (result.isConfirmed) {
        this.executeCancelApi(item);
      }
    });
  }

  closeEditModal() {
    this.isEditModalOpen = false;
    this.isEnBatchMode = false;
    this.enBatchItems = [];
  }

  allowedDepartments: string[] = []; // Stores departments the user can actually access

  isDeptAllowed(dept: string): boolean {
    return this.allowedDepartments.includes(dept);
  }

  // --- Tab Selection ---
  selectDepartment(dept: string) {
    // Prevent selection if not allowed
    if (!this.isDeptAllowed(dept)) {
      return;
    }

    this.selectedEnPlanIds.clear();
    this.selectedEnUniqueIds.clear();

    this.selectedDepartment = dept;

    // Dynamically update sub-tabs based on department
    if (dept === 'EN' || dept === 'QC' || dept === 'Gague') {
      this.subTabs = ['Required', 'Completed', 'Upcoming'];
      this.selectedSubTab = 'Required';
    } else if (dept === 'PD') {
      this.subTabs = ['ALL', 'Upcoming', 'Required', 'Completed', 'Return'];
      this.selectedSubTab = 'ALL';
    } else {
      this.subTabs = ['ALL', 'Upcoming', 'Required', 'Completed'];
      this.selectedSubTab = 'ALL';
    }

    // --- Division Filter Modal Logic ---
    const targetTabs = ['PC', 'PD', 'EN', 'QC', 'Gague'];
    if (targetTabs.includes(dept)) {
      // Default to 'All' to ensure a comprehensive view on initial load and tab switches.
      // Users can still filter by specific divisions using the dropdown menu.
      this.filterDivision = 'All';
      this.onFilterChange();
    } else {
      this.onFilterChange();
    }
  }

  // Helper method for Division Selection Modal
  promptDivisionSelection() {
    Swal.fire({
      iconHtml: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="10" width="28" height="22" rx="2" stroke="#2563eb" stroke-width="2.2" fill="#dbeafe" fill-opacity="0.5"/>
          <rect x="11" y="15" width="5" height="5" rx="0.5" fill="#2563eb" fill-opacity="0.7"/>
          <rect x="19" y="15" width="5" height="5" rx="0.5" fill="#2563eb" fill-opacity="0.7"/>
          <rect x="27" y="15" width="5" height="5" rx="0.5" fill="#2563eb" fill-opacity="0.7"/>
          <rect x="11" y="23" width="5" height="5" rx="0.5" fill="#2563eb" fill-opacity="0.7"/>
          <rect x="19" y="23" width="5" height="5" rx="0.5" fill="#2563eb" fill-opacity="0.7"/>
          <rect x="27" y="23" width="5" height="5" rx="0.5" fill="#2563eb" fill-opacity="0.7"/>
          <rect x="16" y="28" width="8" height="4" rx="0.5" fill="#2563eb" fill-opacity="0.9"/>
          <line x1="5" y1="32" x2="35" y2="32" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
      title: '<span class="swal-division-title">Select Division</span>',
      html: `
        <p class="swal-division-subtitle">
          กรุณาเลือก Division เพื่อเข้าดูข้อมูลแผนงาน<br>
          <span class="swal-division-subtitle-en">(Please select Division to view work plan information)</span>
        </p>

        <div class="swal-division-cards">

          <!-- All Card -->
          <div class="swal-div-choice-card" id="swal-card-all" role="button" tabindex="0">
            <div class="swal-div-choice-icon all" style="background: #f1f5f9; display: flex; align-items: center; justify-content: center; border-radius: 12px; height: 48px; width: 48px; margin-bottom: 12px; color: #64748b;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" width="32" height="32">
                <rect x="4" y="6" width="24" height="20" rx="2" stroke="#64748b" stroke-width="2" fill="#f8fafc"/>
                <path d="M8 12h16M8 16h16M8 20h10" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="swal-div-choice-body">
              <span class="swal-div-choice-name" style="font-weight: 700; color: #1e293b; display: block;">Division: All</span>
              <span class="swal-div-choice-desc" style="font-size: 0.8rem; color: #64748b;">View all divisions</span>
            </div>
          </div>

          <!-- PMC Card -->
          <div class="swal-div-choice-card" id="swal-card-pmc" role="button" tabindex="0">
            <div class="swal-div-choice-icon pmc">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="8" width="24" height="18" rx="1.5" stroke="#2563eb" stroke-width="2" fill="#dbeafe" fill-opacity="0.6"/>
                <rect x="8" y="12" width="4" height="4" rx="0.5" fill="#2563eb" fill-opacity="0.8"/>
                <rect x="14" y="12" width="4" height="4" rx="0.5" fill="#2563eb" fill-opacity="0.8"/>
                <rect x="20" y="12" width="4" height="4" rx="0.5" fill="#2563eb" fill-opacity="0.8"/>
                <rect x="8" y="19" width="4" height="4" rx="0.5" fill="#2563eb" fill-opacity="0.8"/>
                <rect x="14" y="19" width="4" height="4" rx="0.5" fill="#2563eb" fill-opacity="0.8"/>
                <rect x="20" y="19" width="4" height="4" rx="0.5" fill="#2563eb" fill-opacity="0.8"/>
                <rect x="12" y="23" width="8" height="3" rx="0.5" fill="#2563eb"/>
                <line x1="2" y1="26" x2="30" y2="26" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="swal-div-choice-body">
              <span class="swal-div-choice-name">PMC Division</span>
              <span class="swal-div-choice-desc">Choose PMC for this session</span>
            </div>
          </div>

          <!-- GM Card -->
          <div class="swal-div-choice-card" id="swal-card-gm" role="button" tabindex="0">
            <div class="swal-div-choice-icon gm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="8" width="24" height="18" rx="1.5" stroke="#16a34a" stroke-width="2" fill="#dcfce7" fill-opacity="0.6"/>
                <rect x="8" y="12" width="4" height="4" rx="0.5" fill="#16a34a" fill-opacity="0.8"/>
                <rect x="14" y="12" width="4" height="4" rx="0.5" fill="#16a34a" fill-opacity="0.8"/>
                <rect x="20" y="12" width="4" height="4" rx="0.5" fill="#16a34a" fill-opacity="0.8"/>
                <rect x="8" y="19" width="4" height="4" rx="0.5" fill="#16a34a" fill-opacity="0.8"/>
                <rect x="14" y="19" width="4" height="4" rx="0.5" fill="#16a34a" fill-opacity="0.8"/>
                <rect x="20" y="19" width="4" height="4" rx="0.5" fill="#16a34a" fill-opacity="0.8"/>
                <rect x="12" y="23" width="8" height="3" rx="0.5" fill="#16a34a"/>
                <line x1="2" y1="26" x2="30" y2="26" stroke="#16a34a" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="swal-div-choice-body">
              <span class="swal-div-choice-name">GM Division</span>
              <span class="swal-div-choice-desc">Choose GM for this session</span>
            </div>
          </div>

        </div>
      `,
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: {
        popup: 'swal-premium-popup-minimal',
        icon: 'swal-custom-icon-borderless',
      },
      didOpen: (popup) => {
        let resolved = false;

        const resolve = (div: string) => {
          if (resolved) return;
          resolved = true;
          sessionStorage.setItem('planlist_preferred_division', div);
          this.filterDivision = div;
          Swal.close();
          this.onFilterChange();
        };

        const allCard = popup.querySelector('#swal-card-all');
        const pmcCard = popup.querySelector('#swal-card-pmc');
        const gmCard = popup.querySelector('#swal-card-gm');

        allCard?.addEventListener('click', () => resolve('All'));
        pmcCard?.addEventListener('click', () => resolve('PMC'));
        gmCard?.addEventListener('click', () => resolve('GM'));

        // Keyboard support (Enter / Space on focused card)
        allCard?.addEventListener('keydown', (e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter' || ke.key === ' ') { ke.preventDefault(); resolve('All'); }
        });
        pmcCard?.addEventListener('keydown', (e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter' || ke.key === ' ') { ke.preventDefault(); resolve('PMC'); }
        });
        gmCard?.addEventListener('keydown', (e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter' || ke.key === ' ') { ke.preventDefault(); resolve('GM'); }
        });
      }
    });
  }


  getActionRequiredCount(dept: string): number {
    return this.subTabCounts['Required'] || 0;
  }

  selectSubTab(tab: string) {
    this.selectedEnPlanIds.clear();
    this.selectedEnUniqueIds.clear();
    this.selectedSubTab = tab;
    // Reset date range when switching sub-tabs if needed
    if (tab === 'Upcoming') {
      this.selectedDateRange = 'ALL';
    }
    this.currentPage = 1;  // Reset to page 1 on sub-tab change
    this.loadPlanListPaginated(1);
  }

  selectDateRange(range: string) {
    this.selectedDateRange = range;
    this.currentPage = 1;  // Reset to page 1 on range change
    this.loadPlanListPaginated(1);
  }

  saveEdit() {
    // 1. Check if ANY changes occurred
    const original = this.editData.originalItem || {};

    // First convert dateObj back to DD/MM/YYYY string to compare with original date
    let newDateStr = this.editData.date;
    if (this.editData.dateObj instanceof Date && !isNaN(this.editData.dateObj.getTime())) {
      const d = this.editData.dateObj;
      newDateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    }

    // Helper to safely compare strings even if null/empty
    const normalize = (v: any) => (v === null || v === undefined) ? '' : String(v).trim();

    if (this.selectedDepartment === 'EN') {
      this.syncEnPaths();
      console.log('=== SAVE CHANGES: Attachments Data ===', {
        DRAWING: {
          paths: this.enDwgPaths.filter(p => p && p.trim() !== ''),
          revs: this.enDwgRevs.filter(r => r !== ''),
          qty: this.enDwgQty
        },
        LAYOUT: {
          paths: this.enLayoutPaths.filter(p => p && p.trim() !== ''),
          revs: this.enLayoutRevs.filter(r => r !== ''),
          qty: this.enLayoutQty
        }
      });
    }

    // Compare Plan Fields
    const isPlanChanged =
      normalize(newDateStr) !== normalize(original.date) ||
      normalize(this.editData.mcType) !== normalize(original.mcType) ||
      normalize(this.editData.barType) !== normalize(original.barType) ||
      normalize(this.editData.fac) !== normalize(original.fac) ||
      normalize(this.editData.process) !== normalize(original.process) ||
      normalize(this.editData.partBefore) !== normalize(original.partBefore) ||
      normalize(this.editData.mcNo) !== normalize(original.mcNo) ||
      normalize(this.editData.partNo) !== normalize(original.partNo) ||
      Number(this.editData.qty || 0) !== Number(original.qty || 0) ||
      Number(this.editData.time || 0) !== Number(original.time || 0) ||
      normalize(this.editData.comment) !== normalize(original.comment);

    // Compare Path Fields
    const isBatchActive = this.selectedDepartment === 'EN' && this.isEnBatchMode && this.enBatchItems.length > 0;

    const enDwgRevStr = (this.enDwgRevs && this.enDwgRevs[0] !== undefined && this.enDwgRevs[0] !== null)
      ? String(this.enDwgRevs[0]).trim()
      : '';
    const enLayoutRevStr = (this.enLayoutRevs && this.enLayoutRevs[0] !== undefined && this.enLayoutRevs[0] !== null)
      ? String(this.enLayoutRevs[0]).trim()
      : '';
    const enCurrentRev = enDwgRevStr !== '' ? enDwgRevStr : enLayoutRevStr;

    const enCurrentMcQty = (this.enDwgQty !== null && this.enDwgQty !== undefined && !isNaN(Number(this.enDwgQty)))
      ? Number(this.enDwgQty)
      : ((this.enLayoutQty !== null && this.enLayoutQty !== undefined && !isNaN(Number(this.enLayoutQty))) ? Number(this.enLayoutQty) : null);

    const origRev = (original.revision !== undefined && original.revision !== null)
      ? String(original.revision).trim()
      : (original.Revision !== undefined && original.Revision !== null ? String(original.Revision).trim() : '');

    const origMcQty = (original.mcQty !== undefined && original.mcQty !== null)
      ? Number(original.mcQty)
      : (original.MC_QTY !== undefined && original.MC_QTY !== null ? Number(original.MC_QTY) : (original.MC_Qty !== undefined && original.MC_Qty !== null ? Number(original.MC_Qty) : null));

    const origDwgRev = (original.pathDwgRev ?? original.Path_Dwg_Rev ?? '').toString().trim();
    const origLayoutRev = (original.pathLayoutRev ?? original.Path_Layout_Rev ?? '').toString().trim();

    const isEnRevChanged = (
      enDwgRevStr !== origDwgRev ||
      enLayoutRevStr !== origLayoutRev
    );
    const isEnMcQtyChanged = enCurrentMcQty !== null && enCurrentMcQty !== origMcQty;

    const isPathChanged =
      this.editData.pathDwg !== original.pathDwg ||
      this.editData.pathLayout !== original.pathLayout ||
      this.editData.iiqc !== original.iiqc ||
      isEnRevChanged ||
      isEnMcQtyChanged ||
      (isBatchActive && (Boolean(this.editData.pathDwg) || Boolean(this.editData.pathLayout) || enCurrentRev !== '' || enCurrentMcQty !== null));

    // console.log('Changes Detected -> Plan:', isPlanChanged, 'Path:', isPathChanged);

    if (!isPlanChanged && !isPathChanged) {
      Swal.fire({
        title: 'No Changes',
        text: 'You haven\'t modified anything.',
        icon: 'info',
        timer: 2000,
        showConfirmButton: false
      });
      this.isEditModalOpen = false;
      return;
    }

    // 2. Show Confirmation Dialog
    const confirmText = isBatchActive
      ? `คุณต้องการบันทึกข้อมูลไฟล์แนบสำหรับ ${this.enBatchItems.length} รายการที่เลือกหรือไม่?`
      : "คุณต้องการบันทึกข้อมูลหรือไม่?";

    Swal.fire({
      title: 'Confirm Save',
      text: confirmText,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0f172a',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes!',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'swal-premium-popup',
        title: 'swal-premium-title',
        confirmButton: 'swal-premium-confirm',
        cancelButton: 'swal-premium-cancel'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.executeSave(isPlanChanged, isPathChanged);
      }
    });
  }

  private executeSave(isPlanChanged: boolean, isPathChanged: boolean) {
    Swal.fire({
      title: 'Saving...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    // 0. PC Logic: Prefer updatePaths if ONLY paths changed, otherwise savePlan (New Revision)
    if (this.selectedDepartment === 'EN' || this.selectedDepartment === 'QC' || this.selectedDepartment === 'Gague') {
      if (isPathChanged) {
        const original = this.editData.originalItem || {};
        const isDwgCleared = !this.editData.pathDwg || this.editData.pathDwg.trim() === '' || this.editData.pathDwg.trim() === '-';
        const isLayoutCleared = !this.editData.pathLayout || this.editData.pathLayout.trim() === '' || this.editData.pathLayout.trim() === '-';
        const dwgChanged = original.pathDwg !== this.editData.pathDwg;
        const layoutChanged = original.pathLayout !== this.editData.pathLayout;

        const finalDwgSource = (isDwgCleared || dwgChanged || this.editData.drawingSource === 'manual') ? 'manual' : (this.editData.drawingSource || 'auto');
        const finalLayoutSource = (isLayoutCleared || layoutChanged || this.editData.layoutSource === 'manual') ? 'manual' : (this.editData.layoutSource || 'auto');

        const basePayload: any = {
          pathDwg: this.editData.pathDwg,
          pathLayout: this.editData.pathLayout,
          iiqc: this.editData.iiqc,
          pathDwgSource: finalDwgSource,
          pathLayoutSource: finalLayoutSource
        };

        if (this.selectedDepartment === 'EN') {
          const dwgRev = (this.enDwgRevs && this.enDwgRevs[0] !== undefined && this.enDwgRevs[0] !== null) ? String(this.enDwgRevs[0]).trim() : '';
          const layoutRev = (this.enLayoutRevs && this.enLayoutRevs[0] !== undefined && this.enLayoutRevs[0] !== null) ? String(this.enLayoutRevs[0]).trim() : '';
          basePayload.pathDwgRev = dwgRev;
          basePayload.pathLayoutRev = layoutRev;

          const mcQtyVal = (this.enDwgQty !== null && this.enDwgQty !== undefined && !isNaN(Number(this.enDwgQty)))
            ? parseFloat(String(this.enDwgQty))
            : ((this.enLayoutQty !== null && this.enLayoutQty !== undefined && !isNaN(Number(this.enLayoutQty))) ? parseFloat(String(this.enLayoutQty)) : null);
          if (mcQtyVal !== null && !isNaN(mcQtyVal)) {
            basePayload.mcQty = mcQtyVal;
          }
        }

        // --- EN BATCH SAVE ---
        if (this.selectedDepartment === 'EN' && this.isEnBatchMode && this.enBatchItems.length > 0) {
          const groupIds = Array.from(new Set(this.enBatchItems.map((it: any) => it.groupId).filter(Boolean)));
          const planIdsWithoutGroup = this.enBatchItems.filter((it: any) => !it.groupId).map((it: any) => it.id || it.Plan_ID).filter(Boolean);

          const requests: Observable<any>[] = [];
          groupIds.forEach(gId => {
            requests.push(this.pcPlanService.updatePaths({ ...basePayload, groupId: gId }));
          });
          planIdsWithoutGroup.forEach(pId => {
            requests.push(this.pcPlanService.updatePaths({ ...basePayload, planId: pId }));
          });

          if (requests.length === 0) {
            requests.push(this.pcPlanService.updatePaths({ ...basePayload, groupId: this.editData.groupId, planId: this.editData.id || this.editData.Plan_ID }));
          }

          forkJoin(requests).subscribe({
            next: () => {
              if (basePayload.pathDwgRev !== undefined) {
                this.editData.pathDwgRev = basePayload.pathDwgRev;
              }
              if (basePayload.pathLayoutRev !== undefined) {
                this.editData.pathLayoutRev = basePayload.pathLayoutRev;
              }
              if (basePayload.mcQty !== undefined) {
                this.editData.mcQty = basePayload.mcQty;
              }
              // Update in-memory items
              const batchPlanIds = new Set(this.enBatchItems.map((it: any) => it.id || it.Plan_ID).filter(Boolean));
              const batchGroupIds = new Set(this.enBatchItems.map((it: any) => it.groupId).filter((g: any) => g && g !== '-'));
              const matchesBatch = (it: any) => batchPlanIds.has(it.id) || (it.groupId && batchGroupIds.has(it.groupId));

              [this.filteredPlanList, this.planList].forEach(list => {
                (list || []).filter(matchesBatch).forEach((it: any) => {
                  if (basePayload.pathDwg !== undefined) it.pathDwg = basePayload.pathDwg;
                  if (basePayload.pathLayout !== undefined) it.pathLayout = basePayload.pathLayout;
                  if (basePayload.pathDwgRev !== undefined) {
                    it.pathDwgRev = basePayload.pathDwgRev;
                    it.Path_Dwg_Rev = basePayload.pathDwgRev;
                  }
                  if (basePayload.pathLayoutRev !== undefined) {
                    it.pathLayoutRev = basePayload.pathLayoutRev;
                    it.Path_Layout_Rev = basePayload.pathLayoutRev;
                  }
                  if (basePayload.mcQty !== undefined) {
                    it.mcQty = basePayload.mcQty;
                    it.MC_QTY = basePayload.mcQty;
                  }
                });
              });
              this.groupPlanList();

              Swal.fire({
                icon: 'success',
                title: 'สำเร็จ!',
                text: `บันทึกไฟล์แนบสำหรับ ${this.enBatchItems.length} รายการเรียบร้อยแล้วครับ!`,
                timer: 1800,
                showConfirmButton: false
              });
              this.isEditModalOpen = false;
              this.clearEnSelection();
              this.loadPlanListPaginated(this.currentPage);
            },
            error: (err) => {
              console.error('Batch Update Path Error:', err);
              Swal.fire('Error', err.error?.message || 'Failed to update attachments for selected items.', 'error');
            }
          });
          return;
        }

        // --- SINGLE ITEM SAVE ---
        const pathPayload = {
          ...basePayload,
          groupId: this.editData.groupId,
          planId: this.editData.id || this.editData.Plan_ID
        };

        this.pcPlanService.updatePaths(pathPayload).subscribe({
          next: (res) => {
            const original = this.editData.originalItem || {};
            if (basePayload.pathDwgRev !== undefined) {
              this.editData.pathDwgRev = basePayload.pathDwgRev;
              if (original) original.pathDwgRev = basePayload.pathDwgRev;
            }
            if (basePayload.pathLayoutRev !== undefined) {
              this.editData.pathLayoutRev = basePayload.pathLayoutRev;
              if (original) original.pathLayoutRev = basePayload.pathLayoutRev;
            }
            if (basePayload.mcQty !== undefined) {
              this.editData.mcQty = basePayload.mcQty;
              if (original) original.mcQty = basePayload.mcQty;
            }

            // Update in-memory items
            const targetId = this.editData.id || this.editData.Plan_ID;
            const targetGroupId = this.editData.groupId && this.editData.groupId !== '-' ? this.editData.groupId : null;
            const matchesItem = (it: any) => (targetGroupId && it.groupId === targetGroupId) || it.id === targetId;

            [this.filteredPlanList, this.planList].forEach(list => {
              (list || []).filter(matchesItem).forEach((it: any) => {
                if (basePayload.pathDwg !== undefined) it.pathDwg = basePayload.pathDwg;
                if (basePayload.pathLayout !== undefined) it.pathLayout = basePayload.pathLayout;
                if (basePayload.pathDwgRev !== undefined) {
                  it.pathDwgRev = basePayload.pathDwgRev;
                  it.Path_Dwg_Rev = basePayload.pathDwgRev;
                }
                if (basePayload.pathLayoutRev !== undefined) {
                  it.pathLayoutRev = basePayload.pathLayoutRev;
                  it.Path_Layout_Rev = basePayload.pathLayoutRev;
                }
                if (basePayload.mcQty !== undefined) {
                  it.mcQty = basePayload.mcQty;
                  it.MC_QTY = basePayload.mcQty;
                }
              });
            });
            this.groupPlanList();

            Swal.fire('Success', 'บันทึกข้อมูลเสร็จเรียบร้อยแล้วครับ!', 'success');
            this.isEditModalOpen = false;
            if (this.selectedDepartment === 'EN') {
              this.clearEnSelection();
            }
            this.loadPlanListPaginated(this.currentPage);

            // Check transitions
            const isBlank = (v: any) => !v || v.toString().trim() === '' || v.toString().trim() === '-';

            const hasDwg = !isBlank(this.editData.pathDwg);
            const hasLayout = !isBlank(this.editData.pathLayout);
            const hasIIQC = !isBlank(this.editData.iiqc);
            const hasRequest = !isBlank(this.editData.reqStatus);

            const layoutJustUploaded = isBlank(original.pathLayout) && hasLayout;
            const drawingJustUploaded = isBlank(original.pathDwg) && hasDwg;
            const iiqcJustUploaded = isBlank(original.iiqc) && hasIIQC;

            // Format date for email (Template expects YYYY-MM-DD to display as DD/MM/YYYY)
            let emailDate = '-';
            if (this.editData.dateObj instanceof Date) {
              const d = this.editData.dateObj;
              emailDate = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
            } else if (this.editData.date && this.editData.date.includes('/')) {
              const parts = this.editData.date.split('/');
              emailDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            const actionBy = this.currentUser?.Employee_Name || this.currentUser?.Username || 'System';
            const comment = this.editData.comment || '-';

            // Part 1: PD add request and EN add Layout then send email to PH (Only when Layout is just uploaded)
            if (layoutJustUploaded && hasRequest) {
              this.pcPlanService.sendEmail(null, actionBy, emailDate, comment, ['ph', 'purchase'], [], 'Wait PH').subscribe({
                next: () => console.log('Email notification sent successfully to PH'),
                error: (err) => console.error('Failed to send email notification to PH:', err)
              });
            }

            if (hasDwg && hasIIQC && (drawingJustUploaded || iiqcJustUploaded)) {
              this.pcPlanService.sendEmail(null, actionBy, emailDate, comment, ['Gague', 'gauge'], [], 'Wait Gauge').subscribe({
                next: () => console.log('Email notification sent successfully to Gauge'),
                error: (err) => console.error('Failed to send email notification to Gauge:', err)
              });
            }

            // Part 3: (NEW) EN adds or updates Drawing / Layout then send email to PC, PH, PD, Gauge, QC
            // Condition checks if user is EN and either Drawing or Layout was modified
            if (this.selectedDepartment === 'EN' && (original.pathDwg !== this.editData.pathDwg || original.pathLayout !== this.editData.pathLayout)) {
              const targetRoles = ['PC', 'pc', 'PH', 'ph', 'purchase', 'PD', 'pd', 'production', 'Gague', 'gauge', 'QC', 'qc'];
              const orderNo = this.editData.docNo || this.editData.groupId || this.editData.partNo || '-';
              const systemLink = window.location.origin;
              const partNoToEmail = this.editData.partNo || '-';

              let attachedType = '';
              const dwgChanged = original.pathDwg !== this.editData.pathDwg;
              const layoutChanged = original.pathLayout !== this.editData.pathLayout;

              if (dwgChanged && layoutChanged) {
                attachedType = 'Path Drawing and Path Layout';
              } else if (dwgChanged) {
                attachedType = 'Path Drawing';
              } else if (layoutChanged) {
                attachedType = 'Path Layout';
              } else {
                attachedType = '-';
              }

              this.pcPlanService.sendEmail(
                null,
                actionBy,
                emailDate,
                comment,           // Pass EN's comment to the email
                targetRoles,
                [],
                'Waiting PC & PH & PD & Gauge & QC',
                orderNo,
                systemLink,
                partNoToEmail,
                attachedType
              ).subscribe({
                next: () => console.log('Custom email notification sent successfully for EN Update File'),
                error: (err) => console.error('Failed to send EN Update File email:', err)
              });
            }
          },
          error: (err) => {
            console.error('Update Path Error:', err);
            Swal.fire('Error', err.error?.message || 'Failed to update attachments.', 'error');
          }
        });
      } else {
        this.isEditModalOpen = false;
      }
      return;
    }

    if (this.selectedDepartment === 'PC') {
      if (isPathChanged && !isPlanChanged) {
        const original = this.editData.originalItem || {};
        const isDwgCleared = !this.editData.pathDwg || this.editData.pathDwg.trim() === '' || this.editData.pathDwg.trim() === '-';
        const isLayoutCleared = !this.editData.pathLayout || this.editData.pathLayout.trim() === '' || this.editData.pathLayout.trim() === '-';
        const dwgChanged = original.pathDwg !== this.editData.pathDwg;
        const layoutChanged = original.pathLayout !== this.editData.pathLayout;

        const finalDwgSource = (isDwgCleared || dwgChanged || this.editData.drawingSource === 'manual') ? 'manual' : (this.editData.drawingSource || 'auto');
        const finalLayoutSource = (isLayoutCleared || layoutChanged || this.editData.layoutSource === 'manual') ? 'manual' : (this.editData.layoutSource || 'auto');

        const pathPayload = {
          groupId: this.editData.groupId,
          planId: this.editData.id || this.editData.Plan_ID,
          pathDwg: this.editData.pathDwg,
          pathLayout: this.editData.pathLayout,
          iiqc: this.editData.iiqc,
          pathDwgSource: finalDwgSource,
          pathLayoutSource: finalLayoutSource,
          pathDwgRev: this.editData.pathDwgRev,
          pathLayoutRev: this.editData.pathLayoutRev,
          mcQty: this.editData.mcQty
        };

        this.pcPlanService.updatePaths(pathPayload).subscribe({
          next: (res) => {
            Swal.fire('Success', 'Paths updated!', 'success');
            this.isEditModalOpen = false;
            this.loadPlanListPaginated(this.currentPage);

            // Check transitions
            const isBlank = (v: any) => !v || v.toString().trim() === '' || v.toString().trim() === '-';
            const original = this.editData.originalItem || {};

            const hasDwg = !isBlank(this.editData.pathDwg);
            const hasLayout = !isBlank(this.editData.pathLayout);
            const hasIIQC = !isBlank(this.editData.iiqc);
            const hasRequest = !isBlank(this.editData.reqStatus);

            const layoutJustUploaded = isBlank(original.pathLayout) && hasLayout;
            const drawingJustUploaded = isBlank(original.pathDwg) && hasDwg;
            const iiqcJustUploaded = isBlank(original.iiqc) && hasIIQC;

            // Format date for email (Template expects YYYY-MM-DD to display as DD/MM/YYYY)
            let emailDate = '-';
            if (this.editData.dateObj instanceof Date) {
              const d = this.editData.dateObj;
              emailDate = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
            } else if (this.editData.date && this.editData.date.includes('/')) {
              const parts = this.editData.date.split('/');
              emailDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            const actionBy = this.currentUser?.Employee_Name || this.currentUser?.Username || 'System';
            const comment = this.editData.comment || '-';

            // Part 1: PD add request and EN add Layout then send email to PH (Only when Layout is just uploaded)
            if (layoutJustUploaded && hasRequest) {
              console.log('✅ Part 1 complete! Sending email to AonPH...');
              this.pcPlanService.sendEmail(null, actionBy, emailDate, comment, ['ph', 'purchase'], [], 'Wait PH').subscribe({
                next: () => console.log('Email notification sent successfully to PH'),
                error: (err) => console.error('Failed to send email notification to PH:', err)
              });
            }

            // Part 2: EN add Drawing and QC add IIQC then send email to Gauge (Only when Drawing or IIQC is just uploaded)
            if (hasDwg && hasIIQC && (drawingJustUploaded || iiqcJustUploaded)) {
              console.log('✅ Part 2 complete! Sending email to AonGauge...');
              this.pcPlanService.sendEmail(null, actionBy, emailDate, comment, ['Gague', 'gauge'], [], 'Wait Gauge').subscribe({
                next: () => console.log('Email notification sent successfully to Gauge'),
                error: (err) => console.error('Failed to send email notification to Gauge:', err)
              });
            }
          },
          error: (err) => {
            console.error('Update Path Error:', err);
            Swal.fire('Error', 'Failed to update paths.', 'error');
          }
        });
      } else if (isPlanChanged) {
        // Build payload using newDateStr formatted as YYYY-MM-DD for the DB
        let finalDate = '';
        if (this.editData.dateObj instanceof Date && !isNaN(this.editData.dateObj.getTime())) {
          const d = this.editData.dateObj;
          finalDate = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        } else if (typeof this.editData.dateObj === 'string') {
          finalDate = this.editData.dateObj;
        } else {
          // fallback if dateObj is missing but original text date exists
          const parts = (this.editData.date || '').split('/');
          if (parts.length === 3) finalDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        const payload = [{
          date: finalDate,
          employeeId: this.editData.employeeId || this.currentUser?.Employee_ID || null,
          division: this.editData.divisionCode || this.editData.division,
          mcType: this.editData.mcType,
          barType: this.editData.barType,
          fac: this.editData.fac,
          partBefore: this.editData.partBefore,
          mcNo: this.editData.mcNo,
          partNo: this.editData.partNo,
          process: this.editData.process,
          qty: this.editData.qty,
          time: this.editData.time,
          comment: this.editData.comment,
          pathDwg: this.editData.pathDwg,
          pathLayout: this.editData.pathLayout,
          iiqc: this.editData.iiqc,
          groupId: this.editData.groupId,
          revision: (this.editData.revision || 0) + 1,
          planStatus: 'Active',
          uniqueId: this.editData.Unique_Id || null
        }];

        this.pcPlanService.savePlan(payload).subscribe({
          next: (res) => {
            Swal.fire('Success', 'บันทึกข้อมูลการแก้ไขเสร็จเรียบร้อยแล้วครับ!', 'success');
            this.isEditModalOpen = false;
            this.loadPlanListPaginated(this.currentPage);
          },
          error: (err) => {
            console.error('Insert Plan Error:', err);
            Swal.fire('Error', 'บันทึกข้อมูลการแก้ไขไม่สำเร็จครับ!', 'error');
          }
        });
      }
    }
  }


  // ฟังก์ชันเมื่อกดปุ่ม Delete
  onDelete(item: any) {
    if (!item.groupId) {
      Swal.fire('Error', 'No GroupId found for this item.', 'error');
      return;
    }

    Swal.fire({
      title: '<span style="color:#1e293b; font-weight:800;">Are you sure?</span>',
      html: `<div style="color:#64748b; font-size:1rem;">This will delete <b>ALL revisions</b> of this plan!<br><span style="color:#ef4444; font-weight:600;">You won't be able to revert this!</span></div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete all',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'swal-premium-popup',
        title: 'swal-premium-title',
        confirmButton: 'swal-premium-confirm',
        cancelButton: 'swal-premium-cancel'
      },
      backdrop: `rgba(15, 23, 42, 0.6)`
    }).then((result) => {
      if (result.isConfirmed) {
        this.pcPlanService.deletePlanGroup(item.groupId).subscribe({
          next: () => {
            Swal.fire({
              title: '<span style="color:#059669; font-weight:800;">Deleted!</span>',
              text: 'All revisions have been deleted.',
              icon: 'success',
              customClass: {
                popup: 'swal-premium-popup',
                title: 'swal-premium-title',
                confirmButton: 'swal-premium-confirm swal-premium-confirm-success'
              }
            });
            // Reload ตารางใหม่
            this.loadPlanListPaginated(this.currentPage);
          },
          error: (err: any) => {
            console.error('Delete error:', err);
            Swal.fire({
              title: '<span style="color:#ef4444; font-weight:800;">Error!</span>',
              text: 'Failed to delete. Please try again.',
              icon: 'error',
              customClass: {
                popup: 'swal-premium-popup',
                title: 'swal-premium-title',
                confirmButton: 'swal-premium-confirm'
              }
            });
          }
        });
      }
    });
  }

  // --- History Logic ---
  isHistoryModalOpen: boolean = false;
  historyList: any[] = [];
  selectedHistoryItem: any = {};

  onViewHistory(item: any) {
    if (!item.groupId) {
      Swal.fire('Error', 'No GroupId found for this item.', 'error');
      return;
    }

    this.selectedHistoryItem = item;
    this.isHistoryModalOpen = true;
    this.historyList = []; // Clear old data

    // Fetch History
    this.pcPlanService.getPlanHistory(item.groupId).subscribe({
      next: (res) => {
        this.historyList = res.map((h: any) => ({
          ...h,
          date: h.PlanDate ? new Date(h.PlanDate).toLocaleDateString('en-US') : '',
        })).sort((a: any, b: any) => b.Revision - a.Revision);
      },
      error: (err) => {
        console.error('Error fetching history:', err);
        Swal.fire('Error', 'Failed to load history.', 'error');
      }
    });
  }

  closeHistoryModal() {
    this.isHistoryModalOpen = false;
  }

  mapDivisionName(code: string): string {
    if (!code) return 'Unknown';
    const c = code.toString().trim().toUpperCase();
    if (c === '7122' || c === '3' || c === 'GM') return 'GM';
    if (c === '71DZ' || c === '2' || c === 'PMC') return 'PMC';
    return code;
  }

  openFile(filePath: string, requestNo?: string) {
    if (!filePath) {
      Swal.fire('Error', 'File path not found', 'error');
      return;
    }

    // Clean path (remove quotes if any)
    const cleanPath = filePath.replace(/^"|"$/g, '');

    this.fileUploadService.loadPdfFromPath(cleanPath, requestNo).subscribe({
      next: (res) => {
        const base64 = res.imageData.split(',')[1];
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        // Default to PDF for now as per Cart example.
        // Improvement: Detect mime type from extension if needed.
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        window.open(blobUrl, '_blank');
      },
      error: (err) => {
        console.error('File load error:', err);
        Swal.fire('Error', 'ไม่สามารถโหลดไฟล์ได้ เนื่องจากไม่พบไฟล์', 'error');
      }
    });
  }

  copyToClipboard(path: string, label: string = 'Path') {
    if (!path) return;

    // Attempt to copy using Clipboard API
    navigator.clipboard.writeText(path).then(() => {
      Swal.fire({
        icon: 'success',
        title: `<span style="font-weight:700;">${label} Copied!</span>`,
        text: `${label} copied to clipboard.`,
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
    }).catch(err => {
      console.error('Clipboard failed:', err);
      // Fallback or Error message
      Swal.fire('Error', 'Could not copy path. Please copy manually.', 'error');
    });
  }

  // --- Print Functionality ---

  // --- Print Handling ---
  // --- Print Handling ---
  selectPrintType(type: string) {
    this.printType = type;
    this.onPrintTypeChange();
  }

  openPrintModal(item: any) {
    this.selectedItemForPrint = item;
    // User requested "don't input myself" and "count when printing".
    // Defaulting to 1 copy ensures it's valid (even if plan qty is 0) and increments count by 1.
    this.printQty = 1;
    this.printType = null;
    this.previewUrl = null;
    this.isPrintModalOpen = true;
  }

  previewZoom: number = 1;
  previewBlobUrl: string | null = null;
  fullScreenPreviewUrl: any = null;

  closePrintModal() {
    this.isPrintModalOpen = false;
    this.selectedItemForPrint = null;
    this.printQty = null;
    this.printType = null;
    this.previewUrl = null;
    this.fullScreenPreviewUrl = null;
    this.previewBlobUrl = null;
    this.previewZoom = 1;
  }

  openFullScreenPreview() {
    if (this.fullScreenPreviewUrl) {
      this.isFullScreenPreviewOpen = true;
    }
  }

  closeFullScreenPreview() {
    this.isFullScreenPreviewOpen = false;
  }

  onWheelZoom(event: WheelEvent) {
    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
    event.preventDefault();
  }

  // --- Zoom Controls ---
  zoomIn() {
    this.previewZoom += 0.25;
  }

  zoomOut() {
    if (this.previewZoom > 0.5) {
      this.previewZoom -= 0.25;
    }
  }

  resetZoom() {
    this.previewZoom = 1;
  }

  // --- Grab-to-Pan Controls ---
  isPanning: boolean = false;
  panStartX: number = 0;
  panStartY: number = 0;
  panScrollLeft: number = 0;
  panScrollTop: number = 0;

  onPanStart(e: MouseEvent, container: HTMLElement) {
    if (this.previewZoom <= 1) return; // Only pan when zoomed in
    this.isPanning = true;
    this.panStartX = e.pageX - container.offsetLeft;
    this.panStartY = e.pageY - container.offsetTop;
    this.panScrollLeft = container.scrollLeft;
    this.panScrollTop = container.scrollTop;
  }

  onPanMove(e: MouseEvent, container: HTMLElement) {
    if (!this.isPanning) return;
    e.preventDefault(); // Prevent text selection/native drag
    const x = e.pageX - container.offsetLeft;
    const y = e.pageY - container.offsetTop;
    const walkX = x - this.panStartX;
    const walkY = y - this.panStartY;
    container.scrollLeft = this.panScrollLeft - walkX;
    container.scrollTop = this.panScrollTop - walkY;
  }

  onPanEnd() {
    this.isPanning = false;
  }

  onPrintTypeChange() {
    this.previewZoom = 1;
    if (!this.selectedItemForPrint || !this.printType) {
      this.previewUrl = null;
      return;
    }

    const path = this.selectedItemForPrint[this.printType]?.replace(/^"|"$/g, '');
    if (!path || path === '-') {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบไฟล์', 'error');
      this.previewUrl = null;
      this.printType = null; // Reset selection
      return;
    }

    const reqNo = this.selectedItemForPrint?.requestNo || this.selectedItemForPrint?.groupId;
    this.fileUploadService.loadPdfFromPath(path, reqNo).subscribe({
      next: res => {
        const base64 = res.imageData.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        this.previewBlobUrl = blobUrl; // Store raw URL for new tab opening
        this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl + '#toolbar=0&navpanes=0&scrollbar=0&view=FitW');
        this.fullScreenPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH');
      },
      error: err => {
        console.error('Error loading PDF:', err);
        Swal.fire('Error', 'ไม่สามารถโหลด PDF ได้', 'error');
        this.previewUrl = null;
        this.fullScreenPreviewUrl = null;
        this.previewBlobUrl = null;
      }
    });
  }

  openInNewTab() {
    if (this.previewBlobUrl) {
      window.open(this.previewBlobUrl, '_blank');
    }
  }

  printPdf() {
    if (!this.selectedItemForPrint || !this.printType) {
      Swal.fire('แจ้งเตือน', 'กรุณาเลือกประเภทที่ต้องการพิมพ์', 'warning');
      return;
    }

    const qty = 1; // Default to 1 for history tracking without user input

    const path = this.selectedItemForPrint[this.printType]?.replace(/^"|"$/g, '');
    if (!path || path === '-') {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบไฟล์', 'error');
      return;
    }

    const reqNo = this.selectedItemForPrint?.requestNo || this.selectedItemForPrint?.groupId;

    // Load PDF again for printing (consistent with History logic)
    this.fileUploadService.loadPdfFromPath(path, reqNo).subscribe({
      next: res => {
        const base64 = res.imageData.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const blob = new Blob([bytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        const employeeId = this.currentUser?.Employee_ID || 'Unknown';

        // NOTE: Using GroupId as DocNo because PlanList items don't have a formal DocNo
        // This links the print history to the plan group.
        const docNoToSave = this.selectedItemForPrint.groupId;

        let typePrintToSend = '';
        if (this.printType === 'pathLayout') typePrintToSend = 'PathLayout';
        else if (this.printType === 'pathDwg') typePrintToSend = 'PathDwg';
        else if (this.printType === 'iiqc') typePrintToSend = 'IIQC';

        // Parse DueDate to ensure it's a valid Date object for SQL
        let dueDateVal = this.selectedItemForPrint.date;
        if (typeof dueDateVal === 'string') {
          // Attempt to parse 'dd/mm/yyyy' or 'yyyy-mm-dd'
          const parts = dueDateVal.split('/');
          if (parts.length === 3) {
            dueDateVal = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          } else {
            dueDateVal = new Date(dueDateVal);
          }
        }
        // Fallback to today if invalid
        if (!dueDateVal || isNaN(dueDateVal.getTime())) {
          dueDateVal = new Date();
        }

        // Create hidden iframe for print
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);

        iframe.onload = () => {
          const contentWindow = iframe.contentWindow;
          if (contentWindow) {

            // 1. Save Print History Immediately
            this.savePrintHistory(qty, docNoToSave, typePrintToSend, employeeId, dueDateVal);

            // 2. Focus and Print (Wrapped in setTimeout to allow HTTP request to dispatch before blocking thread)
            setTimeout(() => {
              contentWindow.focus();
              contentWindow.print();
            }, 100);

            // 3. Clean up iframe when print dialog closes
            const onPrintClose = () => {
              setTimeout(() => {
                try {
                  document.body.removeChild(iframe);
                  URL.revokeObjectURL(blobUrl);
                } catch (e) { }
              }, 1000);
            };

            contentWindow.onafterprint = onPrintClose;
          }
        };

      },
      error: err => {
        console.error('Error print PDF:', err);
        Swal.fire('Error', 'Unable to load PDF for printing.', 'error');
      }
    });
  }

  savePrintHistory(qty: number, docNoToSave: string, typePrintToSend: string, employeeId: string, dueDateVal: any) {
    this.historyPrint.SaveHistoryPrint({
      EmployeeID: employeeId,
      Division: this.selectedItemForPrint.division || 'Unknown',
      DocNo: docNoToSave || '-',
      PratNo: this.selectedItemForPrint.partNo || '-',
      DueDate: dueDateVal,
      TypePrint: typePrintToSend,
      Total: qty
    }).subscribe({
      next: () => {

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Print history saved.',
          showConfirmButton: false,
          timer: 2000
        });
      },
      error: err => {
        console.error("Save history error:", err);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'error',
          title: 'Failed to save print history.',
          showConfirmButton: false,
          timer: 3000
        });
      }
    });
  }


  // ===================================================
  //  Tooling Request Details Modal (PD Tab VIEW button)
  // ===================================================

  onViewToolingRequest(item: any) {
    // Feature requested: "status viewd user in that division must click the view button in table and will update viewd in notification"
    if (this.notificationService) {
      this.notificationService.markAsReadByDocNos([item.Unique_Id, item.groupId, item.Doc_No, item.pseudoGroupId]);
    }

    // Always open the modal — populate header from item directly (no API needed for header)
    this.isToolingRequestModalOpen = true;
    this.toolingCuttingList = [];
    this.toolingSetupList = [];
    this.toolingRequestLoading = true;

    // Set header info directly from plan item (not from API)
    this.toolingRequestHeader = {
      partNo: item.partNo || '-',
      process: item.process || '-',
      mcType: item.mcType || '-',
      mcNo: item.mcNo || '-',
      fac: item.fac || '-',
      requester: item.requester || item.employeeId || this.currentUser?.Name || this.currentUser?.Employee_ID || '-'
    };

    // console.log('📋 [TOOLING REQUEST MODAL] Opened with header:', this.toolingRequestHeader);
    // console.log('📋 [TOOLING REQUEST] Unique_Id:', item.Unique_Id);

    // If no Unique_Id → show modal with empty tables (no Request found)
    if (!item.Unique_Id) {
      console.warn('⚠️ [TOOLING REQUEST] No Unique_Id found');
      this.toolingRequestLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.toolingRequestLoading = true;
    const apiUrl = `${environment.apiUrl}/get_ToolingRequest_ByUniqueId`;
    // console.log('🔍 [TOOLING REQUEST] Calling API:', apiUrl, 'with uniqueId:', item.Unique_Id);

    this.http.post<any>(apiUrl, { uniqueId: item.Unique_Id }).subscribe({
      next: (result) => {
        // console.log('✅ [TOOLING REQUEST] API response received:', result);
        // Extract arrays - handle different possible response structures
        this.toolingCuttingList = result?.cuttingTool || result?.cuttingTools || [];
        this.toolingSetupList = result?.setupTool || result?.setupTools || [];

        // console.log('✅ [TOOLING REQUEST] Cutting Tools:', this.toolingCuttingList.length, 'items');
        // console.log('✅ [TOOLING REQUEST] Setup Tools:', this.toolingSetupList.length, 'items');
        // console.log('📊 Cutting Tool List:', this.toolingCuttingList);
        // console.log('📊 Setup Tool List:', this.toolingSetupList);

        this.toolingRequestLoading = false;
        this.cdr.detectChanges(); // Force immediate re-render so template sees updated arrays
      },
      error: (err) => {
        console.error('❌ [TOOLING REQUEST] API error:', err);
        this.toolingRequestLoading = false;
        this.cdr.detectChanges(); // Force immediate re-render even on error

        Swal.fire({
          icon: 'error',
          title: 'Failed to Load Tooling Request',
          text: 'Unable to fetch tooling request details. Please try again.',
          confirmButtonText: 'OK'
        });
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

  // --- Return Tab Logic (PD Only) ---

  getReturnStatusStyle(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'pending': return 'background:#fff7ed; color:#c2410c; padding:2px 10px; border-radius:999px; font-size:0.78rem; font-weight:600;';
      case 'completed': return 'background:#dcfce7; color:#166534; padding:2px 10px; border-radius:999px; font-size:0.78rem; font-weight:600;';
      default: return 'background:#f1f5f9; color:#475569; padding:2px 10px; border-radius:999px; font-size:0.78rem;';
    }
  }

  // ─── Export Modal ──────────────────────────────────────────────────

  onExport(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // console.log('[Export] Button Fired! showExportModal:', this.showExportModal);
    this.showExportModal = true;
    this.exportMode = null;
    this.cdr.detectChanges();
  }

  closeExportModal(): void {
    this.showExportModal = false;
    this.exportMode = null;
  }

  /* ── Shared Excel helper ── */
  private async _buildAndDownloadExcel(rows: any[], fileName: string): Promise<void> {
    const ExcelJSModule = await import('exceljs');
    const workbook = new ExcelJSModule.Workbook();
    const sheet = workbook.addWorksheet('PC Plan');

    const columns = [
      { header: 'Plan Date', key: 'PlanDate', width: 14 },
      { header: 'Division', key: 'Division', width: 10 },
      { header: 'MC Type', key: 'MC_Type', width: 12 },
      { header: 'Bar Type', key: 'Bar_Type', width: 14 },
      { header: 'Facility', key: 'Facility', width: 10 },
      { header: 'Part Before', key: 'Before_Part', width: 14 },
      { header: 'Process', key: 'Process', width: 16 },
      { header: 'Machine No.', key: 'MC_No', width: 14 },
      { header: 'Part No.', key: 'PartNo', width: 14 },
      { header: 'QTY', key: 'QTY', width: 8 },
      { header: 'Time', key: 'Time', width: 8 },
      { header: 'Comment', key: 'Comment', width: 26 },
      { header: 'Status', key: 'PlanStatus', width: 12 },
    ];
    sheet.columns = columns;

    // Header style
    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF475569' } } };
    });
    headerRow.height = 22;

    rows.forEach((row, i) => {
      const r = sheet.addRow(row);
      r.eachCell(cell => {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
      });
    });
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: columns.length } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }

  async doCurrentExport(): Promise<void> {
    if (this.isExporting) return;
    this.isExporting = true;
    try {
      // Map camelCase filteredPlanList back to PascalCase for Excel columns
      const rows = this.filteredPlanList.map(item => ({
        PlanDate: item.date,
        Division: item.division,
        MC_Type: item.mcType,
        Bar_Type: item.barType || '',
        Facility: item.fac,
        Before_Part: item.partBefore,
        Process: item.process,
        MC_No: item.mcNo,
        PartNo: item.partNo,
        QTY: item.qty,
        Time: item.time,
        Comment: item.comment,
        PlanStatus: item.planStatus
      }));
      const today = new Date();
      const stamp = `${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}`;
      await this._buildAndDownloadExcel(rows, `PCPlan_CurrentView_${this.selectedDepartment}_${stamp}.xlsx`);
      this.closeExportModal();
    } finally {
      this.isExporting = false;
    }
  }

  async doHistoryExport(): Promise<void> {
    if (!this.exportMonth || !this.exportYear || this.isExporting) return;
    this.isExporting = true;
    try {
      const url = `${environment.apiUrl}/pc-plan/export-history?month=${this.exportMonth}&year=${this.exportYear}`;
      this.http.get<any[]>(url).subscribe({
        next: async (rows) => {
          const monthLabel = this.exportMonths.find(m => m.value === this.exportMonth)?.label ?? this.exportMonth;
          await this._buildAndDownloadExcel(rows, `PCPlan_History_${monthLabel}_${this.exportYear}.xlsx`);
          this.isExporting = false;
          this.closeExportModal();
        },
        error: (err) => {
          console.error('[exportHistory] API error', err);
          this.isExporting = false;
          Swal.fire({ icon: 'error', title: 'Export Failed', text: 'Could not fetch history data. Please try again.', timer: 3000 });
        }
      });
    } catch {
      this.isExporting = false;
    }
  }

  getFileName(filePath: string): string {
    if (!filePath || filePath.trim() === '-' || filePath.trim() === '') return '';
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1];
  }

  /** Returns groupedPlanList filtered for EN/QC/Gague Required tab.
   *  EN Required: hide expired (grey) + groups where ALL items fully READY (pathDwg+pathLayout+iiqc).
   *  QC Required: hide expired (grey) + groups where ALL items already have IIQC.
   *  Gague Required: hide expired (grey) + cancelled groups (same as EN/QC).
   *  All other dept/tab combos return full list unchanged.
   */
  get visibleGroupedPlanList() {
    const isQcCompleted = (this.selectedDepartment === 'QC' || this.selectedDepartment === 'Gague') && this.selectedSubTab === 'Completed';
    const isQcRequired  = (this.selectedDepartment === 'QC' || this.selectedDepartment === 'Gague') && this.selectedSubTab === 'Required';

    if (!isQcCompleted && !isQcRequired) {
      return this.groupedPlanList;
    }

    return this.groupedPlanList
      .map((group) => {
        let items = group.items;

        if (isQcCompleted) {
          // QC/Gague Completed tab: ONLY show items that have Path_IIQC attached!
          items = items.filter(it => it.iiqc && it.iiqc !== '-' && it.iiqc.trim() !== '');
        } else if (isQcRequired) {
          // QC/Gague Required tab: ONLY show items where Path_IIQC is NOT attached yet!
          items = items.filter(it => !it.iiqc || it.iiqc === '-' || it.iiqc.trim() !== '');
        }

        const activeItems = items.filter((it: any) => it.planStatus !== 'Cancelled');
        const activeCount = activeItems.length;

        const sourceParts = activeCount > 0 ? activeItems : items;
        const uniqueParts = [...new Set(sourceParts.map((it: any) => it.partNo).filter((p: any) => p))];
        const summaryParts = uniqueParts.slice(0, 3).join(', ') + (uniqueParts.length > 3 ? ` +${uniqueParts.length - 3}` : '');

        return {
          ...group,
          items: items,
          orderCount: activeCount,
          totalCount: items.length,
          summaryParts: summaryParts
        };
      })
      .filter((group) => group.items.length > 0);
  }

  get displayTotalCount(): number {
    if (!this.visibleGroupedPlanList) return 0;
    return this.visibleGroupedPlanList.length;
  }

  get displayStartRecord(): number {
    if (this.displayTotalCount === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get displayEndRecord(): number {
    return Math.min(this.currentPage * this.pageSize, this.displayTotalCount);
  }

  get displayTotalPages(): number {
    return Math.max(1, Math.ceil(this.displayTotalCount / this.pageSize));
  }

  get displayPageNumbers(): number[] {
    const pages: number[] = [];
    const max = this.displayTotalPages;
    for (let i = 1; i <= max; i++) pages.push(i);
    return pages;
  }
}
