import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, NotificationLog } from '../../../core/services/notification.service';
import { FileUploadSerice } from '../../../core/services/FileUpload.service';
import { NOTIFICATION_TEMPLATES, getTemplate, getFieldLabel } from '../../../core/utils/notification-templates';
import { BehaviorSubject, Observable, Subscription, combineLatest, map, tap } from 'rxjs';
import Swal from 'sweetalert2';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-notification-inbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-inbox.component.html',
  styleUrls: ['./notification-inbox.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationInboxComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  notifications$: Observable<NotificationLog[]>;
  unreadCount$: Observable<number>;
  pmcUnreadCount$!: Observable<number>;
  gmUnreadCount$!: Observable<number>;
  isLoading$: Observable<boolean>;

  filter: 2 | 3 = 2; // 2=PMC, 3=GM

  /** Which top-level view is active */
  view: 'inbox' | 'trash' = 'inbox';

  /** Trash observable from service */
  trash$: Observable<NotificationLog[]>;

  /** Global language toggle — controls ALL notification bodies */
  lang: 'EN' | 'TH' = 'EN';

  /** Accordion: ID of the currently expanded notification (null = all collapsed) */
  expandedId: number | null = null;

  /** Selection State */
  selectedIds = new Set<number>();

  /** Pagination State */
  currentPage: number = 1;
  itemsPerPage: number = 20;

  /** Memoization cache for parseDetails — keyed by Notification_ID */
  private _detailsCache = new Map<number, any>();

  /** Lazy Loading: Store resolved details and loading state */
  private _lazyDetails = new Map<number, any>();
  /** Public getter for template to check loading status */
  public loadingMap = new Map<number, boolean>();

  /** Cached filtered observables (avoid getter re-creation) */
  filteredNotifications$!: Observable<NotificationLog[]>;
  currentFilteredItems: NotificationLog[] = [];
  filteredUnreadCount$!: Observable<number>;
  totalInboxPages$!: Observable<number>;
  filteredTrash$!: Observable<NotificationLog[]>;
  totalTrashPages$!: Observable<number>;

  /** Internal trigger subjects for filter/page changes */
  private filter$ = new BehaviorSubject<2 | 3>(2);
  private currentPage$ = new BehaviorSubject<number>(1);

  /** Print Modal State */
  isPrintModalOpen = false;
  previewUrl: SafeResourceUrl | null = null;
  previewBlobUrl: string | null = null;
  previewZoom: number = 1;
  isPanning: boolean = false;
  panStartX: number = 0;
  panStartY: number = 0;
  panScrollLeft: number = 0;
  panScrollTop: number = 0;
  selectedFileName: string = '';

  /** Subscriptions for cleanup */
  private _subs: Subscription[] = [];

  constructor(
    private notificationService: NotificationService,
    private fileUploadService: FileUploadSerice,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    this.notifications$ = this.notificationService.notifications$;
    this.unreadCount$ = this.notificationService.unreadCount$;
    this.trash$ = this.notificationService.trash$;
    this.isLoading$ = this.notificationService.isLoading$;
  }

  ngOnInit(): void {
    // Clear the memoization cache whenever the raw notification list changes
    this._subs.push(
      this.notifications$.subscribe(() => this._detailsCache.clear())
    );
    this._subs.push(
      this.trash$.subscribe(() => {
        this._detailsCache.clear();
        this._lazyDetails.clear();
        this.loadingMap.clear();
      })
    );

    // Build cached observables that only re-compute when source data or filter/page changes
    this._buildCachedObservables();
  }

  ngOnDestroy(): void {
    // Prevent memory leaks: clear cache and unsubscribe
    this._detailsCache.clear();
    this._subs.forEach(s => s.unsubscribe());
  }

  /** trackBy function for *ngFor — prevents full DOM re-render */
  trackByNotificationId(_index: number, item: NotificationLog): number {
    return item.Notification_ID ?? _index;
  }

  closeModal() {
    this.close.emit();
  }

  switchToInbox() {
    this.view = 'inbox';
    this.currentPage = 1;
    this.currentPage$.next(1);
  }

  switchToTrash() {
    this.view = 'trash';
    this.currentPage = 1;
    this.currentPage$.next(1);
  }

  // ─── File Utilities ──────────────────────────────────────────

  /** Proxy file opening via backend (handles network paths) */
  openFile(filePath: string, fileName: string = 'Document') {
    if (!filePath || filePath === '-') {
      Swal.fire('Error', 'File path not found', 'error');
      return;
    }

    // Clean path (remove quotes if any)
    const cleanPath = filePath.replace(/^"|"$/g, '');

    this.selectedFileName = fileName;
    this.previewZoom = 1;
    this.previewUrl = null;
    this.previewBlobUrl = null;
    this.isPrintModalOpen = true;

    this.fileUploadService.loadPdfFromPath(cleanPath).subscribe({
      next: (res) => {
        const base64 = res.imageData.split(',')[1];
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        this.previewBlobUrl = blobUrl;
        this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl + '#toolbar=0&navpanes=0&scrollbar=0');
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('File load error:', err);
        Swal.fire('Error', 'Unable to load file. It might be missing or inaccessible.', 'error');
        this.isPrintModalOpen = false;
        this.cdr.markForCheck();
      }
    });
  }

  closePrintModal() {
    this.isPrintModalOpen = false;
    this.previewUrl = null;
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
    }
    this.previewBlobUrl = null;
    this.previewZoom = 1;
  }

  zoomIn() { this.previewZoom += 0.25; }
  zoomOut() { if (this.previewZoom > 0.5) this.previewZoom -= 0.25; }
  resetZoom() { this.previewZoom = 1; }

  onPanStart(e: MouseEvent, container: HTMLElement) {
    if (this.previewZoom <= 1) return;
    this.isPanning = true;
    this.panStartX = e.pageX - container.offsetLeft;
    this.panStartY = e.pageY - container.offsetTop;
    this.panScrollLeft = container.scrollLeft;
    this.panScrollTop = container.scrollTop;
  }
  onPanMove(e: MouseEvent, container: HTMLElement) {
    if (!this.isPanning) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const y = e.pageY - container.offsetTop;
    const walkX = x - this.panStartX;
    const walkY = y - this.panStartY;
    container.scrollLeft = this.panScrollLeft - walkX;
    container.scrollTop = this.panScrollTop - walkY;
  }
  onPanEnd() { this.isPanning = false; }

  // ─── Filtering & Pagination ─────────────────────────────────────────────

  /** Build all cached observables once. They react to filter$/currentPage$/source data changes. */
  private _buildCachedObservables() {
    // Helper: filter notifications by current Division tab
    const filterByDiv = (notifications: NotificationLog[], activeFilter: 2 | 3, ignoreMute: boolean = false) => {
      if (!notifications) return [];
      return notifications.filter(n => {
        const div = this.getNotificationDivision(n);
        const activeLabel = activeFilter === 2 ? 'PMC' : 'GM';
        const isMatch = (div === 'UNKNOWN') ? (activeFilter === 2) : (div === activeLabel);

        if (ignoreMute) return isMatch;

        // Exclude if this division is globally muted
        const divId = activeLabel === 'PMC' ? 2 : 3;
        const isMuted = divId === this.mutedDivision;

        return isMatch && !isMuted;
      });
    };

    // Tab Badges (Return 0 if the division is explicitly muted to hide the badge)
    this.pmcUnreadCount$ = this.notifications$.pipe(
      map(notifications => {
        if (this.mutedDivision === 2) return 0;
        return filterByDiv(notifications, 2, true).filter(n => !n.IsRead).length;
      })
    );
    this.gmUnreadCount$ = this.notifications$.pipe(
      map(notifications => {
        if (this.mutedDivision === 3) return 0;
        return filterByDiv(notifications, 3, true).filter(n => !n.IsRead).length;
      })
    );

    // Filtered + paginated inbox notifications
    this.filteredNotifications$ = combineLatest([
      this.notifications$,
      this.filter$,
      this.currentPage$
    ]).pipe(
      map(([notifications, activeFilter, page]) => {
        const filtered = filterByDiv(notifications, activeFilter);
        const startIndex = (page - 1) * this.itemsPerPage;
        return filtered.slice(startIndex, startIndex + this.itemsPerPage);
      }),
      tap(items => this.currentFilteredItems = items || [])
    );

    // Unread count scoped to the active division tab (matches what the inbox actually shows)
    this.filteredUnreadCount$ = combineLatest([
      this.notifications$,
      this.filter$
    ]).pipe(
      map(([notifications, activeFilter]) => {
        return filterByDiv(notifications, activeFilter).filter(n => !n.IsRead).length;
      })
    );

    // Total inbox pages
    this.totalInboxPages$ = combineLatest([
      this.notifications$,
      this.filter$
    ]).pipe(
      map(([notifications, activeFilter]) => {
        const filtered = filterByDiv(notifications, activeFilter);
        return Math.ceil(filtered.length / this.itemsPerPage);
      })
    );

    // Filtered + paginated trash
    this.filteredTrash$ = combineLatest([
      this.trash$,
      this.filter$,
      this.currentPage$
    ]).pipe(
      map(([items, activeFilter, page]) => {
        if (!items) return [];
        const filtered = items.filter(n => {
          const div = this.getNotificationDivision(n);
          const effective = div === 'UNKNOWN' ? 'PMC' : div;
          const activeLabel = activeFilter === 2 ? 'PMC' : 'GM';
          return effective === activeLabel;
        });
        const startIndex = (page - 1) * this.itemsPerPage;
        return filtered.slice(startIndex, startIndex + this.itemsPerPage);
      })
    );

    // Total trash pages
    this.totalTrashPages$ = combineLatest([
      this.trash$,
      this.filter$
    ]).pipe(
      map(([items, activeFilter]) => {
        if (!items) return 0;
        const filtered = items.filter(n => {
          const div = this.getNotificationDivision(n);
          const effective = div === 'UNKNOWN' ? 'PMC' : div;
          const activeLabel = activeFilter === 2 ? 'PMC' : 'GM';
          return effective === activeLabel;
        });
        return Math.ceil(filtered.length / this.itemsPerPage);
      })
    );
  }

  setFilter(filter: 2 | 3) {
    this.filter = filter;
    this.currentPage = 1;
    // Push to subjects so cached observables re-fire
    this.filter$.next(filter);
    this.currentPage$.next(1);
  }

  // ─── Mute Preference ───────────────────────────────────────

  get mutedDivision(): number | null {
    return this.notificationService.mutedDivision;
  }

  toggleMute(divisionId: 2 | 3, event: Event) {
    event.stopPropagation();
    const newVal = this.mutedDivision === divisionId ? null : divisionId;
    this.notificationService.setMutedDivision(newVal);
    // Force re-evaluation of filtered observables by pulsing the filter subject
    this.filter$.next(this.filter);
  }

  getNotificationDivision(item: NotificationLog): 'PMC' | 'GM' | 'UNKNOWN' {
    // 1. Priority: Numeric Division_Id from Server
    if (item.Division_Id === 2) return 'PMC';
    if (item.Division_Id === 3) return 'GM';

    const details = this.parseDetails(item);

    // 2. Secondary: Explicit Division from Backend (inside Details_JSON)
    if (details?.Division_Id === 2 || details?.divisionId === 2) return 'PMC';
    if (details?.Division_Id === 3 || details?.divisionId === 3) return 'GM';

    if (details?.Division) {
      const div = details.Division.toString().toUpperCase();
      if (div === 'PMC' || div === '2' || div === '71DZ') return 'PMC';
      if (div === 'GM' || div === '3' || div === '7122') return 'GM';
    }

    // 2. Fallback: Check nested item summaries (Legacy/Excel payloads)
    if (details?.items?.length > 0) {
      const div = (details.items[0].Division || details.items[0].division || '').toString().toUpperCase();
      if (div === 'PMC' || div === '2' || div === '71DZ') return 'PMC';
      if (div === 'GM' || div === '3' || div === '7122') return 'GM';
    }

    // 3. Last Resort: Infer from Doc No
    if (item.Doc_No) {
      const doc = item.Doc_No.toUpperCase();
      if (doc.includes('PLAN-2') || doc.includes('71DZ')) return 'PMC';
      if (doc.includes('PLAN-3') || doc.includes('7122')) return 'GM';
      // Production request patterns (SETRL, SETTN, etc.) default to PMC for now
      if (doc.includes('RL') || doc.includes('TN') || doc.includes('ML')) return 'PMC';
    }

    return 'UNKNOWN';
  }

  // ─── Global Language Toggle ────────────────────────────────

  toggleLang() {
    this.lang = this.lang === 'EN' ? 'TH' : 'EN';
  }

  // ─── Accordion Toggle ──────────────────────────────────────

  toggleExpand(item: NotificationLog) {
    if (this.expandedId === item.Notification_ID) {
      // Collapse if already open
      this.expandedId = null;
    } else {
      // Expand newly clicked item and mark as read
      const id = item.Notification_ID ?? null;
      this.expandedId = id;

      // POINTER ARCHITECTURE: Lazy load details if missing
      const parsed = this.parseDetails(item);
      const hasFullDetails = parsed && (parsed.items?.length > 0 || parsed.changes?.length > 0 || parsed.AttachedFiles?.length > 0);

      // FIX: For NEW_PLAN, ALWAYS re-fetch details because path status
      // changes over time as EN/QC attach files. The initial Details_JSON
      // has items but no paths, so hasFullDetails=true but status is stale.
      const isNewPlan = item.Event_Type === 'NEW_PLAN';
      const shouldFetch = isNewPlan || (!hasFullDetails && !(id != null && this._lazyDetails.has(id)));

      if (id && shouldFetch && !this.loadingMap.get(id)) {
        this.loadingMap.set(id, true);
        this.notificationService.getNotificationDetails(id).subscribe({
          next: (details) => {
            this._lazyDetails.set(id, details);
            this._detailsCache.delete(id!); // Evict stale initial parse
            this.loadingMap.set(id, false);
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('[Notification] Failed to lazy-load details:', err);
            this.loadingMap.set(id, false);
            this.cdr.markForCheck();
          }
        });
      }

      if (!item.IsRead && id) {
        this.notificationService.markAsRead(id);
      }
    }
  }

  isExpanded(item: NotificationLog): boolean {
    return this.expandedId === item.Notification_ID;
  }

  // ─── Pagination Actions ────────────────────────────────────

  nextPage(totalPages: number) {
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.expandedId = null;
      this.currentPage$.next(this.currentPage);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.expandedId = null;
      this.currentPage$.next(this.currentPage);
    }
  }

  // ─── Top-Level Actions ─────────────────────────────────────

  markAllAsRead() {
    this.notificationService.markAllRead();
  }

  // ─── Selection Logic ─────────────────────────────────────────

  toggleSelection(item: NotificationLog, event: Event) {
    event.stopPropagation();
    const id = item.Notification_ID;
    if (!id) return;
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.cdr.markForCheck();
  }

  isSelected(item: NotificationLog): boolean {
    return this.selectedIds.has(item.Notification_ID!);
  }

  toggleSelectAll(event: Event) {
    event.stopPropagation();
    const items = this.currentFilteredItems;
    if (!items || items.length === 0) return;

    const allIds = items.map(i => i.Notification_ID!).filter(id => id != null);
    const allSelected = allIds.length > 0 && allIds.every(id => this.selectedIds.has(id));
    if (allSelected) {
      allIds.forEach(id => this.selectedIds.delete(id));
    } else {
      allIds.forEach(id => this.selectedIds.add(id));
    }
    this.cdr.markForCheck();
  }

  isAllSelected(): boolean {
    const items = this.currentFilteredItems;
    if (!items || items.length === 0) return false;
    return items.every(i => this.selectedIds.has(i.Notification_ID!));
  }

  isIndeterminate(): boolean {
    const items = this.currentFilteredItems;
    if (!items || items.length === 0) return false;
    const some = items.some(i => this.selectedIds.has(i.Notification_ID!));
    const all = items.every(i => this.selectedIds.has(i.Notification_ID!));
    return some && !all;
  }

  /** Delete selected notifications (requires user to select before deleting) */
  deleteSelected() {
    if (this.selectedIds.size === 0) {
      Swal.fire({
        title: this.lang === 'TH' ? 'กรุณาเลือกรายการ' : 'Select items first',
        text: this.lang === 'TH' ? 'กรุณาเลือกรายการที่ต้องการลบก่อน' : 'Please select notifications to delete.',
        icon: 'warning',
        toast: true,
        position: 'bottom-end',
        timer: 3000,
        showConfirmButton: false
      });
      return;
    }

    Swal.fire({
      title: this.lang === 'TH' ? 'ยืนยันการลบ' : 'Confirm Delete',
      text: this.lang === 'TH'
        ? `ต้องการลบ ${this.selectedIds.size} รายการที่เลือก?`
        : `Delete ${this.selectedIds.size} selected notification(s)?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: this.lang === 'TH' ? 'ลบ' : 'Delete',
      cancelButtonText: this.lang === 'TH' ? 'ยกเลิก' : 'Cancel',
      confirmButtonColor: '#ef4444'
    }).then((result) => {
      if (result.isConfirmed) {
        const idsToDelete = Array.from(this.selectedIds);

        // Delete only the selected IDs (not ALL read notifications)
        this.notificationService.deleteByIds(idsToDelete).subscribe({
          next: () => {
            // Clean up memoization caches for deleted items
            idsToDelete.forEach(id => this.evictFromCache(id));
            this.selectedIds.clear();
            Swal.fire({
              title: this.lang === 'TH' ? 'ลบสำเร็จ' : 'Deleted',
              text: this.lang === 'TH'
                ? `ย้าย ${idsToDelete.length} รายการลงถังขยะ`
                : `Moved ${idsToDelete.length} notification(s) to trash.`,
              icon: 'success',
              toast: true,
              position: 'bottom-end',
              timer: 3000,
              showConfirmButton: false
            });
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('Failed to delete selected:', err);
            Swal.fire('Error', 'Failed to delete selected notifications.', 'error');
          }
        });
      }
    });
  }

  // Trash: Restore single item
  restoreItem(id?: number) {
    if (!id) return;
    this.notificationService.restoreFromTrash(id).subscribe({
      next: () => {
        Swal.fire({
          title: this.lang === 'TH' ? 'กู้คืนสำเร็จ' : 'Restored',
          text: this.lang === 'TH' ? 'ข้อความถูกกู้คืนไปยังกล่องข้อความแล้ว' : 'Notification restored to inbox.',
          icon: 'success',
          toast: true,
          position: 'bottom-end',
          timer: 3000,
          showConfirmButton: false
        });
      }
    });
  }

  navigateCTA(item: NotificationLog) {
    const route = this.getCTARoute(item);
    if (route) {
      this.router.navigateByUrl(route);
      this.close.emit();
    }
  }

  // ─── Display Formatting ────────────────────────────────────

  /**
   * Build the subject line, prioritizing the frontend template with variables
   * for a premium feel. Falls back to Backend's pre-built subject.
   */
  getSubject(item: NotificationLog): string {
    // Fallback for historical records without JSON payloads
    if (!item.Details_JSON && item.Subject) {
      return item.Subject;
    }

    let subject = item.Subject || item.Event_Type;
    const tmpl = getTemplate(item.Event_Type);
    if (tmpl) {
      const vars = this._buildVars(item);
      subject = this._interpolate(tmpl.subject, vars);
    }

    // --- Dynamic Status Override ---
    // If all tasks are done (EN/QC attached everything), update the subject prefix to Complete
    if (this.isAllDivisionsDone(item)) {
      subject = subject.replace('🔵 [FYI]', '🟢 [Complete]');
      subject = subject.replace('🔴 [Action Required]', '🟢 [Complete]');
    }

    return subject;
  }

  /**
   * Get the message body, prioritizing the frontend template (with Thai support).
   * Falls back to Backend's pre-built messages.
   */
  getBody(item: NotificationLog): string {
    // Fallback for historical records without JSON payloads
    if (!item.Details_JSON && (item.Message_TH || item.Message)) {
      return this.lang === 'TH' ? (item.Message_TH || item.Message || '') : (item.Message || item.Message_TH || '');
    }

    const tmpl = getTemplate(item.Event_Type);
    if (tmpl) {
      const vars = this._buildVars(item);
      return this.lang === 'TH' ? tmpl.messageTH(vars) : tmpl.messageEN(vars);
    }

    // Fallback to Backend pre-built messages
    if (this.lang === 'TH') {
      return item.Message_TH || item.Message || '';
    }
    return item.Message || '';
  }

  getIconClass(item: NotificationLog): string {
    if (this.isAllDivisionsDone(item)) {
      return 'bi-check-circle-fill';
    }
    const tmpl = getTemplate(item.Event_Type);
    return tmpl?.iconClass || 'bi-info-circle';
  }

  getBadgeColor(item: NotificationLog): string {
    if (this.isAllDivisionsDone(item)) {
      return '#22c55e'; // Success Green
    }
    const tmpl = getTemplate(item.Event_Type);
    return tmpl?.badgeColor || '#64748b';
  }

  getEventLabel(item: NotificationLog): string {
    const eventType = item.Event_Type;
    const labels: Record<string, string> = {
      'REQUEST_SENT': 'New Request',
      'REQUEST_COMPLETED': 'Request Completed',
      'NEW_PLAN': 'New Plan',
      'NEW_REQUEST': 'New Request',
      'PLAN_REVISION': 'Edit Plan',
      'CANCEL_PLAN': 'Plan Cancelled',
      'UPDATE_PLAN': 'Document Attached',  // fallback only
      'RETURN_SENT': 'Return Pending',
      'RETURN_COMPLETED': 'Return Confirmed',
      'FILE_UPLOAD': 'File Uploaded'
    };

    if (eventType === 'PLAN_REVISION') {
      const changes = this.getDetailChanges(item);
      if (changes && changes.length > 0) {
        const fieldLabels = changes.map(c => this.fieldLabel(c.field));
        let labelStr = '';
        if (fieldLabels.length <= 2) {
          labelStr = fieldLabels.join(', ');
        } else {
          labelStr = fieldLabels[0] + (this.lang === 'EN' ? ` and ${fieldLabels.length - 1} others` : ` และอื่นๆ อีก ${fieldLabels.length - 1}`);
        }
        return (this.lang === 'EN' ? 'Edit ' : 'Edit') + labelStr;
      }
    }

    if (eventType === 'UPDATE_PLAN' && item.Subject) {
      // Extract dynamic attachment title from Subject, e.g.:
      //   "🔵 [FYI] Drawing Attached"   → "Drawing Attached"
      //   "🔵 [FYI] Layout Attached"    → "Layout Attached"
      //   "🔵 [FYI] Drawing & Layout Attached" → "Drawing & Layout Attached"
      //   "🔵 [FYI] IIQC Attached"     → "IIQC Attached"
      const match = item.Subject.match(/\]\s*(.*)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return labels[eventType] || eventType;
  }

  getCTALabel(item: NotificationLog): string {
    const tmpl = getTemplate(item.Event_Type);
    return tmpl?.ctaLabel || 'View Details';
  }

  getCTARoute(item: NotificationLog): string {
    return item.CTA_Route || getTemplate(item.Event_Type)?.ctaRoute || '/';
  }

  formatDate(date: Date | string): string {
    if (!date) return '';

    let d: Date;
    if (typeof date === 'string') {
      // Strip 'Z' because the backend mssql driver stringifies local time as UTC.
      // Removing 'Z' forces the browser to interpret the time as local instead of offsetting it.
      d = new Date(date.replace('Z', ''));
    } else {
      d = new Date(date);
    }

    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }) + ' ' + d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  stopPropagation(event: Event) {
    event.stopPropagation();
  }

  // ─── Private Helpers ───────────────────────────────────────

  private _interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\[(\w+)\]/g, (_, key) => vars[key] ?? `[${key}]`);
  }

  /** Helper: Extract all potential variables for Template interpolation */
  private _buildVars(item: NotificationLog): Record<string, string> {
    const d = this.parseDetails(item);

    // --- Look into the items array if root-level is empty ---
    let firstItemPartNo = '';
    let firstItemPlanDate = '';
    if (d?.items && d.items.length > 0) {
      firstItemPartNo = d.items[0].PartNo || '';
      firstItemPlanDate = d.items[0].PlanDate || '';
    }

    // Combine all possible sources of variables
    const cleanDocNo = (item.Doc_No && item.Doc_No.length > 30) ? 'Grouped Items' : (item.Doc_No || '');
    const vars: Record<string, any> = {
      Plan_No: cleanDocNo,
      Doc_No: cleanDocNo,
      User_Name: item.Action_By || 'System',
      Action_By: item.Action_By || 'System',
      Item_Count: d?.totalItems || d?.items?.length || d?.count || '',
      Part_No: d?.PartNo || d?.newValues?.PartNo || firstItemPartNo || '',
      PartNo: d?.PartNo || d?.newValues?.PartNo || firstItemPartNo || '',
      Plan_Date: this.formatFieldValue('PlanDate', d?.PlanDate || d?.newValues?.PlanDate || firstItemPlanDate || ''),
      DueDate: this.formatFieldValue('date', d?.DueDate || (d?.items && d.items.length > 0 ? (d.items[0].After_DueDate || d.items[0].DueDate) : '')),
      Edited_Fields: d?.changes?.length > 0
        ? d.changes.map((c: any) => this.fieldLabel(c.field)).join(', ')
        : (this.lang === 'TH' ? 'Data' : 'Data'),
      ...d // Spread Details_JSON to allow additional custom keys
    };

    // Convert everything to string for interpolation
    const stringified: Record<string, string> = {};
    Object.keys(vars).forEach(k => {
      stringified[k] = (vars[k] === null || vars[k] === undefined) ? '' : String(vars[k]);
    });

    return stringified;
  }

  // ─── Details JSON Dynamic Rendering ──────────────────────

  /** Fields to hide from the detailed view (internal/redundant) */
  private SKIP_FIELDS = new Set([
    'GroupId', 'Revision', 'PlanStatus', 'Division', 'Employee_ID',
    'Path_Dwg', 'Path_Layout', 'Path_IIQC',
    'Plan_ID', 'IsActive', 'Unique_Id', 'Created_At', 'Updated_At',
    'fieldChanges', 'editStatus', 'isActualEdit', 'isNew', 'isLocked',
    'divisionId', 'divisionName', 'type', 'groupIds', 'totalItems',
    'enStatus', 'qcStatus', 'allDone', 'enCompleteCount', 'qcCompleteCount',
    'totalOrders', 'pathStatusItems', 'AttachedFiles', 'docNo', 'count',
    'changes', 'PartNo_display'
  ]);

  /** Parse Details_JSON with memoization — cached by Notification_ID to avoid re-parsing on every CD cycle */
  parseDetails(item: NotificationLog): any {
    const cacheKey = item.Notification_ID;

    // 0. Priority: Lazy-loaded details from Pointer Resolver
    if (cacheKey != null && this._lazyDetails.has(cacheKey)) {
      return this._lazyDetails.get(cacheKey);
    }

    if (!item.Details_JSON) return null;

    // Return cached result if available
    if (cacheKey != null && this._detailsCache.has(cacheKey)) {
      return this._detailsCache.get(cacheKey);
    }

    // Parse string-form JSON from DB
    if (typeof item.Details_JSON === 'string') {
      try {
        item.Details_JSON = JSON.parse(item.Details_JSON);
      } catch {
        return null;
      }
    }

    // Store in cache
    if (cacheKey != null) {
      this._detailsCache.set(cacheKey, item.Details_JSON);
    }

    return item.Details_JSON;
  }

  /** Remove a specific notification from the memoization cache (e.g. on delete/trash) */
  evictFromCache(id: number) {
    this._detailsCache.delete(id);
  }

  /** Get the detail type: 'new_plan', 'revision', 'cancel', or null */
  getDetailType(item: NotificationLog): string | null {
    const d = this.parseDetails(item);
    return d?.type || null;
  }

  /** For NEW_PLAN: get the items array */
  getDetailItems(item: NotificationLog): any[] {
    const d = this.parseDetails(item);
    return d?.items || [];
  }

  /** For PLAN_REVISION: get the changes array [{field, old, new}] */
  getDetailChanges(item: NotificationLog): any[] {
    const d = this.parseDetails(item);
    return d?.changes || [];
  }

  /** Get display keys for item grid (filters out internal fields and empty values) */
  getItemKeys(row: any, eventType?: string): string[] {
    if (!row) return [];
    const keys = Object.keys(row);

    if (eventType === 'CANCEL_PLAN') {
      const allowed = new Set(['PlanDate', 'PartNo', 'MC_Type', 'Process', 'MC_No', 'QTY', 'Time', 'Comment']);
      return keys.filter(k => allowed.has(k));
    }

    return keys.filter(k => k !== 'Division' && k !== 'Facility' && !this.SKIP_FIELDS.has(k));
  }

  /** Translate a DB field name to a readable label using the current lang */
  fieldLabel(field: string): string {
    return getFieldLabel(field, this.lang);
  }

  /** Format specific field values for display (e.g., Dates) */
  formatFieldValue(field: string, value: any): any {
    if (!value) return value;
    if (field === 'PlanDate' || field === 'Return_Date' || field === 'date') {
      const strValue = String(value);
      // Convert YYYY-MM-DD (or YYYY-MM-DDTHH:mm:SSZ) to DD/MM/YYYY
      if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
        const datePart = strValue.split('T')[0];
        const parts = datePart.split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
    }
    return value;
  }

  /** Extract metadata blocks like Plan Date, Part No, Division from JSON payload */
  getMetaValue(item: NotificationLog, key: 'PlanDate' | 'PartNo' | 'Division' | 'Facility'): string | null {
    const d = this.parseDetails(item);
    if (!d) return null;

    // Map expected keys to potential alternatives (Excel uses lowercase/shorter names)
    const keyMap: Record<string, string[]> = {
      'PlanDate': ['PlanDate', 'date', 'Plan_Date'],
      'PartNo': ['PartNo', 'partNo', 'Part_No'],
      'Division': ['Division', 'division'],
      'Facility': ['Facility', 'fac', 'FAC']
    };

    const searchKeys = keyMap[key] || [key];
    let val = null;

    if (d.type === 'revision' && d.newValues) {
      // Check all potential keys in newValues
      for (const k of searchKeys) {
        if (d.newValues[k] !== undefined && d.newValues[k] !== null) {
          val = d.newValues[k];
          break;
        }
      }
    } else if ((d.type === 'new_plan' || d.type === 'cancel' || d.type === 'new_request') && d.items && d.items.length > 0) {
      const first = d.items[0];
      for (const k of searchKeys) {
        if (first[k] !== undefined && first[k] !== null) {
          val = first[k];
          break;
        }
      }
    } else if (d.type === 'update_plan') {
      for (const k of searchKeys) {
        if (d[k] !== undefined && d[k] !== null) {
          val = d[k];
          break;
        }
      }
    }

    if (val) {
      return (key === 'PlanDate') ? this.formatFieldValue('PlanDate', val) : val;
    }
    return null;
  }

  /** Check if a details payload has content worth showing */
  hasDetails(item: NotificationLog): boolean {
    // Pointer Architecture: These types ALWAYS have potential details to fetch from business tables
    const pointerTypes = [
      'NEW_PLAN', 'PLAN_REVISION', 'CANCEL_PLAN',
      'REQUEST_SENT', 'REQUEST_COMPLETED', 'NEW_REQUEST',
      'RETURN_SENT', 'RETURN_COMPLETED', 'GROUPED_REQUEST_COMPLETED'
    ];
    if (pointerTypes.includes(item.Event_Type)) return true;

    const d = this.parseDetails(item);
    if (!d) return false;
    // Revision: either specific field changes OR a batch of items
    if (d.type === 'revision' && (d.changes?.length > 0 || d.items?.length > 0)) return true;
    if (d.type === 'cancel' && d.items?.length > 0) return true;
    if (d.type === 'new_request' && d.items?.length > 0) return true;
    if (d.type === 'grouped_request_completed' && d.items?.length > 0) return true;
    if (d.type === 'request_completed' && d.items?.length > 0) return true;
    if (d.type === 'update_plan' && d.AttachedFiles?.length > 0) return true;
    return false;
  }

  // ─── Division Status Display (Accordion) ─────────────────────

  /**
   * Determine the status of a division for a given notification.
   * Returns: 'done' | 'pending' | 'na'
   *
   * For NEW_PLAN: uses backend-resolved batch completion status
   * (checks ALL orders in the request have paths filled)
   */
  private _getDivisionStatus(item: NotificationLog, division: 'PC' | 'EN' | 'QC'): 'done' | 'pending' | 'na' {
    const d = this.parseDetails(item);
    const eventType = item.Event_Type;

    // REQUEST and RETURN events are PD/PH flows — they must NOT affect PC/EN/QC turn status
    if (eventType.includes('REQUEST') || eventType.includes('RETURN')) {
      return 'na';
    }

    if (division === 'PC') {
      // PC is "done" only for plan-related events (PC created the plan)
      if (['NEW_PLAN', 'PLAN_REVISION', 'CANCEL_PLAN', 'UPDATE_PLAN'].includes(eventType)) {
        return 'done';
      }
      return 'na';
    }

    if (division === 'EN') {
      if (d) {
        // Priority 1: Use backend-resolved batch status (from getNotificationDetails)
        // This checks ALL items in the batch have BOTH Drawing AND Layout
        if (d.enStatus === 'done') return 'done';
        if (d.enStatus === 'pending') return 'pending';

        // Fallback: Check items (backend-provided per-item breakdown)
        // EN is DONE only when ALL items have BOTH Drawing AND Layout
        if (d.items && Array.isArray(d.items) && d.items.length > 0) {
          const allHaveDwgAndLayout = d.items.every((r: any) => r.pathDwg && r.pathLayout);
          return allHaveDwgAndLayout ? 'done' : 'pending';
        }
      }
      // If it's a plan-related event, EN is pending (needs to add drawing/layout)
      if (['NEW_PLAN', 'PLAN_REVISION'].includes(eventType)) {
        return 'pending';
      }
      return 'na';
    }

    if (division === 'QC') {
      if (d) {
        // Priority 1: Use backend-resolved batch status (from getNotificationDetails)
        // This checks ALL items in the batch have IIQC
        if (d.qcStatus === 'done') return 'done';
        if (d.qcStatus === 'pending') return 'pending';

        // Fallback: Check items (backend-provided per-item breakdown)
        // QC is DONE only when ALL items have IIQC
        if (d.items && Array.isArray(d.items) && d.items.length > 0) {
          const allHaveIIQC = d.items.every((r: any) => r.iiqc);
          return allHaveIIQC ? 'done' : 'pending';
        }
      }
      if (['NEW_PLAN', 'PLAN_REVISION', 'UPDATE_PLAN'].includes(eventType)) {
        return 'pending';
      }
      return 'na';
    }

    return 'na';
  }

  /**
   * Check if ALL divisions (EN + QC) have completed their tasks for this notification.
   * Used to turn the notification green.
   */
  isAllDivisionsDone(item: NotificationLog): boolean {
    const d = this.parseDetails(item);
    // Priority: Use backend-resolved allDone flag (most accurate — checks all orders in batch)
    if (d && d.allDone === true) return true;
    if (d && d.allDone === false) return false;

    // Fallback: Check individual division statuses
    const en = this._getDivisionStatus(item, 'EN');
    const qc = this._getDivisionStatus(item, 'QC');
    return en === 'done' && qc === 'done';
  }

  getDivisionStatusClass(item: NotificationLog, division: 'PC' | 'EN' | 'QC'): string {
    const s = this._getDivisionStatus(item, division);
    if (s === 'done') return 'status-done';
    if (s === 'pending') return 'status-pending';
    return 'status-na';
  }

  getDivisionStatusIcon(item: NotificationLog, division: 'PC' | 'EN' | 'QC'): string {
    const s = this._getDivisionStatus(item, division);
    if (s === 'done') return 'bi-check-circle-fill';
    if (s === 'pending') return 'bi-clock-history';
    return 'bi-dash-circle';
  }

  getDivisionStatusLabel(item: NotificationLog, division: 'PC' | 'EN' | 'QC'): string {
    if (division === 'PC') return this.lang === 'EN' ? 'Assign' : 'มอบหมาย';
    if (division === 'EN') return this.lang === 'EN' ? 'Drawing / Layout' : 'แบบ / Layout';
    if (division === 'QC') return this.lang === 'EN' ? 'IIQC' : 'IIQC';
    return '';
  }

  getDivisionStatusText(item: NotificationLog, division: 'PC' | 'EN' | 'QC'): string {
    const s = this._getDivisionStatus(item, division);
    if (s === 'done') return this.lang === 'EN' ? 'Done' : 'เสร็จ';
    if (s === 'pending') return this.lang === 'EN' ? 'Pending' : 'รอดำเนินการ';
    return '-';
  }
}
