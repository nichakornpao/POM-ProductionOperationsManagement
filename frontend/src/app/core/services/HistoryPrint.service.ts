import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root' // ระบุว่า service นี้จะถูกให้บริการใน root module
})

export class HistoryPrint {
  private baseUrl = environment.apiUrl
  public user: any;
  snapshot: any;
  constructor( // คอนสตรัคเตอร์ของ service
    private httpClient: HttpClient // เก็บ HttpClient สำหรับทำ HTTP requests
  ) { }

  SaveHistoryPrint(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/SaveHistoryPrint`, data)
  }


  // ดึงรายชื่อ Employee ที่มีสิทธิ์ print
  EmpPrint(): Observable<any[]> {
    return this.httpClient.get<any[]>(`${this.baseUrl}/emp-print`);
  }

  // ตรวจสอบสิทธิ์ Employee ก่อน print
  checkPrintPermission(Employee_ID: string): Observable<{ allowed: boolean }> {
    return this.httpClient.get<{ allowed: boolean }>(
      `${this.baseUrl}/check-print-permission?Employee_ID=${Employee_ID}`
    );
  }

  HistoryPrint(): Observable<any> { // ฟังก์ชันสำหรับดึงหมายเลขชิ้นส่วน
    return this.httpClient.get(`${this.baseUrl}/HistoryPrint`); // ส่ง HTTP GET Division
  }
}
