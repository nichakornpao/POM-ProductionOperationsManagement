import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PCPlanService {

  private baseUrl = `${environment.apiUrl}/pc-plan`;

  private divisionsCache$: Observable<any[]> | null = null;
  private masterDataCache = new Map<string, any>();

  // --- State Persistence ---
  private planState = {
    selectedDivisionCode: '',
    planItems: [] as any[]
  };

  constructor(private http: HttpClient) { }

  setPlanState(state: { selectedDivisionCode: string, planItems: any[] }) {
    this.planState = state;
  }

  getPlanState() {
    return this.planState;
  }

  clearPlanState() {
    this.planState = {
      selectedDivisionCode: '',
      planItems: []
    };
  }

  // 1. ดึง Division List (Cached)
  getDivisions(): Observable<any[]> {
    if (!this.divisionsCache$) {      // 1. เช็คก่อนว่าเคยดึงหรือยัง?
      // 2. ถ้ายังไม่เคย ให้ยิงไปดึง แล้วสั่ง shareReplay(1)
      this.divisionsCache$ = this.http.get<any[]>(`${this.baseUrl}/divisions`).pipe(
        shareReplay(1)
      );
    }
    return this.divisionsCache$;      // 3. ส่งของเดิมที่ดึงไว้แล้วกลับไป
  }

  // 2. *** ฟังก์ชันใหม่: ดึง Master Data (Split Loading: FAST/SLOW) ***
  // URL: /api/pc-plan/master-data/71DZ?mode=FAST
  getMasterData(divCode: string, mode: string = 'ALL'): Observable<any> {
    const cacheKey = `${divCode}_${mode}`; // Composite Cache Key

    const cached = this.masterDataCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.timestamp < 300000) { // 5 minutes TTL
        return of(cached.data);
      }
      this.masterDataCache.delete(cacheKey);
    }

    return this.http.get<any>(`${this.baseUrl}/master-data/${divCode}?mode=${mode}`).pipe(
      tap(data => this.masterDataCache.set(cacheKey, { data, timestamp: Date.now() }))
    );
  }

  // 3. ฟังก์ชันสำหรับล้าง Cache (เผื่ออยากให้โหลดใหม่โดยไม่ต้องรีเฟรชหน้าจอ)
  clearCache() {
    this.divisionsCache$ = null;
    this.masterDataCache.clear();
  }

  // 4. บันทึกข้อมูล (Insert)
  savePlan(data: any[]): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/insert`, data);
  }

  // 5. ดึงรายการ  // --- New Methods ---
  getPlanList(showHistory: boolean = false): Observable<any> {
    const timestamp = new Date().getTime();
    return this.http.get<any>(`${this.baseUrl}/list?showHistory=${showHistory}&t=${timestamp}`);
  }

  // 5.1 ดึงรายการสำหรับ PD tab (พร้อม ReqStatus จาก Status column ใน Request tables)
  getPlanListPD(showHistory: boolean = false): Observable<any> {
    const timestamp = new Date().getTime();
    return this.http.get<any>(`${this.baseUrl}/pd-list?showHistory=${showHistory}&t=${timestamp}`);
  }

  // 5.2 ดึงรายการแบบ Server-Side Pagination
  getPlanListPaginated(params: {
    page: number;
    pageSize?: number;
    department: string;
    subTab: string;
    showHistory?: boolean;
    filterDate?: string | null;
    filterMachine?: string | null;
    filterFac?: string | null;
    filterProcess?: string | null;
    filterPartNo?: string | null;
    filterDivision?: string | null;
    filterStatus?: string | null;
    sortDir?: string;
  }): Observable<any> {
    const p = params;
    let url = `${this.baseUrl}/paginated?page=${p.page}&pageSize=${p.pageSize || 100}` +
      `&department=${encodeURIComponent(p.department)}` +
      `&subTab=${encodeURIComponent(p.subTab)}` +
      `&showHistory=${p.showHistory || false}` +
      `&t=${Date.now()}`;
    if (p.sortDir) url += `&sortDir=${p.sortDir}`;
    if (p.filterDate) url += `&filterDate=${p.filterDate}`;
    if (p.filterMachine) url += `&filterMachine=${encodeURIComponent(p.filterMachine)}`;
    if (p.filterFac) url += `&filterFac=${encodeURIComponent(p.filterFac)}`;
    if (p.filterProcess) url += `&filterProcess=${encodeURIComponent(p.filterProcess)}`;
    if (p.filterPartNo) url += `&filterPartNo=${encodeURIComponent(p.filterPartNo)}`;
    if (p.filterDivision) url += `&filterDivision=${encodeURIComponent(p.filterDivision)}`;
    if (p.filterStatus) url += `&filterStatus=${encodeURIComponent(p.filterStatus)}`;
    return this.http.get<any>(url);
  }

  updatePaths(data: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/update-paths`, data);
  }

  // 5.1 อัปเดตข้อมูล Plan แบบ In-Place (ไม่สร้าง Revision ใหม่)
  updatePlan(data: any): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/update`, data);
  }

  // 5.2 Cancel Plan แบบ In-Place (เปลี่ยนสถานะเป็น Cancelled)
  // uniqueId: ถ้ามี จะส่งไปให้ Backend อัปเดต Status_To_PH ในตาราง Request Document ด้วย
  cancelPlan(id: number, uniqueId?: string): Observable<any> {
    const body = uniqueId ? { uniqueId } : {};
    return this.http.put<any>(`${this.baseUrl}/cancel/${id}`, body);
  }


  // 6. ลบข้อมูล (Delete)
  deletePlan(id: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/delete/${id}`);
  }

  deletePlanGroup(groupId: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/delete-group/${groupId}`);
  }
  getPlanHistory(groupId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/history/${groupId}`);
  }

  // 7. Send Email Notification
  sendEmail(receiver: string | null, actionBy?: string, planDate?: string, comment?: string, roles?: string[], names?: string[], status?: string, orderNo?: string, systemLink?: string, partNo?: string, attachedType?: string): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/email/send`, { receiver, actionBy, planDate, comment, roles, names, status, orderNo, systemLink, partNo, attachedType });
  }

  // 8. Mark EN Completed
  markEnCompleted(payload: { planIds?: number[], uniqueIds?: string[] }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/mark-en-completed`, payload);
  }
}
