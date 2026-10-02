import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})

export class RequestService {
  private baseUrl = environment.apiUrl
  public user: any;

  // Cache & State Storage
  private divisionCache$: Observable<any> | null = null;
  private cache = new Map<string, any>();
  private requestPageState: any = null; // Store Request Page state

  saveRequestState(state: any) {
    this.requestPageState = JSON.parse(JSON.stringify(state)); // Deep copy to avoid reference issues
  }

  getRequestState(): any {
    return this.requestPageState;
  }

  clearRequestState() {
    this.requestPageState = null;
  }

  constructor(
    private httpClient: HttpClient
  ) { }



  // Generic Cache Helper
  private getCachedRequest(endpoint: string, data: any): Observable<any> {
    const key = `${endpoint}:${JSON.stringify(data)}`;
    if (this.cache.has(key)) {
      // Return cached observable (using 'of' for immediate value if stored as value, 
      // but simpler to store the observable or just value. Let's store value to avoid observable cold/hot issues or duplicate in-flight?)
      // Actually RxJS shareReplay is better for in-flight + cache.
      // But for parameterized, creating 1000s of observables is messy. 
      // Let's store the response data:
      return of(this.cache.get(key));
    }

    return this.httpClient.post(`${this.baseUrl}/${endpoint}`, data).pipe(
      tap(res => this.cache.set(key, res))
    );
  }





  // ของใหม่ (Setup - Table ใหม่)


  // Setup Tool Dropdowns
  get_Setup_Division(): Observable<any> {
    return this.httpClient.get(`${this.baseUrl}/get_Setup_Division`);
  }

  get_Setup_Facility(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/get_Setup_Facility`, data);
  }





  // Case SET APIs (CuttingTool + SetupTool)


  // New Combined API for Case SET (Cutting + Setup)
  get_CaseSET_All(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/get_CaseSET_All`, data);
  }

  // API สำหรับดึงรายละเอียด Box/Shelf/Rack
  get_CaseSET_CuttingTool_Detail(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/get_CaseSET_CuttingTool_Detail`, data);
  }

  // Case SET Dropdown APIs
  get_CaseSET_Dropdown_PartNo(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/get_CaseSET_Dropdown_PartNo`, data);
  }

  get_CaseSET_Dropdown_Process(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/get_CaseSET_Dropdown_Process`, data);
  }

  get_CaseSET_Dropdown_MC(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/get_CaseSET_Dropdown_MC`, data);
  }

  get_CaseSET_Dropdown_ItemNo(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/get_CaseSET_Dropdown_ItemNo`, data);
  }

  // Add Request Tooling (Submit)
  add_Request_Tooling(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/add_Request_Tooling`, data);
  }

  clearCache() {
    this.divisionCache$ = null;
    this.cache.clear();
  }
}
