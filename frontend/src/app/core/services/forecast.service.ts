import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ForecastService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getForecast(month: string, year: string, revision: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/query?month=${month}&year=${year}&revision=${revision}`);
  }

  getConnectionStatus(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/forecast/connection-status`);
  }

  getToolingMaster(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/tooling-master`);
  }

  importToolingMaster(data: any[]): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forecast/tooling-master/import`, data);
  }

  submitForecast(payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forecast/submit`, payload);
  }

  getOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/orders`);
  }

  insertOrder(order: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forecast/orders/insert`, order);
  }

  updateOrder(order: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forecast/orders/update`, order);
  }

  deleteOrder(orderId: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/forecast/orders/delete/${orderId}`);
  }

  importPlanningExcel(data: FormData): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forecast/import-planning`, data);
  }

  savePCPlan(payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forecast/save-pc-plan`, payload);
  }

  saveForecastBalance(payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/forecast/save-balance`, payload);
  }

  getForecastBalance(month: string, year: string, revision: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/balance?month=${month}&year=${year}&revision=${revision}`);
  }

  getPCPlan(month: string, year: string, revision: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/pc-plan?month=${month}&year=${year}&revision=${revision}`);
  }

  getIncomingPO(year: string, month: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/incoming-po?year=${year}&month=${month}`);
  }

  getIncomingPR(year: string, month: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/incoming-pr?year=${year}&month=${month}`);
  }

  getStockOnRack(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/stock-on-rack`);
  }

  getToolingUsageParameters(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/tooling-usage`);
  }

  getToolingUsageAudit(toolingCode: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/forecast/tooling-usage-audit/${toolingCode}`);
  }

  getDailyIssue(year: string, month: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/daily-issue?year=${year}&month=${month}`);
  }

  getCuttingToolsStockSummary(year: string, month: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/stock-summary-daily?year=${year}&month=${month}`);
  }

  getCuttingToolsInventoryDaily(year: string, month: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/forecast/cuttingtools-inventory-daily?year=${year}&month=${month}`);
  }

  getAutoloadStatus(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/forecast/autoload-status`);
  }
}

