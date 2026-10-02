import { Injectable } from '@angular/core'; // นำเข้า Injectable จาก Angular core
import { HttpClient } from '@angular/common/http'; // นำเข้า HttpClient สำหรับทำ HTTP requests
import { Observable } from 'rxjs'; // นำเข้า Observable จาก RxJS
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root' // ระบุว่า service นี้จะถูกให้บริการใน root module
})
export class PurchaseHistoryservice {
  private baseUrl = environment.apiUrl
  public user: any; // ตัวแปรสำหรับเก็บข้อมูลผู้ใช้

  constructor( // คอนสตรัคเตอร์ของ service
    private httpClient: HttpClient // เก็บ HttpClient สำหรับทำ HTTP requests
  ) { }

  Purchase_History(): Observable<any> { // ฟังก์ชันสำหรับดึงหมายเลขชิ้นส่วน
    return this.httpClient.get(`${this.baseUrl}/Purchase_History`) // ส่ง HTTP GET request เพื่อดึงหมายเลขชิ้นส่วน
  }

  updateHistoryFields(data: { Public_Id: string, MFGOrderNo: string, DocNo: string, ItemNo: string, DateComplete?: string | null, QTY?: number | null, Remark?: string | null }): Observable<any> {
    return this.httpClient.put(`${this.baseUrl}/Purchase_History/update`, data);
  }

  exportToAS400(division: string, data: any[]): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/as400/export`, { division, data });
  }

  getAS400Config(): Observable<any> {
    return this.httpClient.get(`${this.baseUrl}/as400/config`);
  }

  updateAutoFireConfig(isEnabled: boolean): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/as400/config/auto-fire`, { isEnabled });
  }
}
