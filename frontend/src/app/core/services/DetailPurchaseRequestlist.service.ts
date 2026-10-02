import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root' // ระบุว่า service นี้จะถูกให้บริการใน root module
})

export class DetailPurchaseRequestlistService {
  private baseUrl = environment.apiUrl;
  public user: any;
  snapshot: any;
  private itemNoCache$: Observable<any> | null = null;

  constructor( // คอนสตรัคเตอร์ของ service
    private httpClient: HttpClient // เก็บ HttpClient สำหรับทำ HTTP requests
  ) { }

  Detail_Request(): Observable<any> { // ฟังก์ชันสำหรับดึงหมายเลขชิ้นส่วน
    return this.httpClient.get(`${this.baseUrl}/Detail_Purchase?_t=${new Date().getTime()}`); // ส่ง HTTP GET Division
  }

  Detail_Request_Setup(): Observable<any> {
    return this.httpClient.get(`${this.baseUrl}/Detail_Purchase_Setup?_t=${new Date().getTime()}`);
  }

  Detail_CaseSetup(): Observable<any> {
    return this.httpClient.get(`${this.baseUrl}/Detail_CaseSetup?_t=${new Date().getTime()}`);
  }

  updateStatusToComplete(idOrIds: number | number[], status: string, tableType?: string) {
    return this.httpClient.post(`${this.baseUrl}/Update_Status_Purchase`, {
      ID_Request: idOrIds,  //  ส่งเป็น array ได้
      Status: status,
      TableType: tableType
    });
  }

  updateQtyAndStatus(payload: { ID_Request: number; QTY: number; Status: string }[]): Observable<any> {
    return this.httpClient.put(`${this.baseUrl}/updateQtyAndStatus`, payload);
  }

  updateRequest(updatedItem: any): Observable<any> {
    return this.httpClient.put(`${this.baseUrl}/Update_Request`, updatedItem);
  }



  deleteRequest(id: number | string): Observable<any> {
    return this.httpClient.delete(`${this.baseUrl}/Delete_Request/${id}`);
  }

  insertRequestBulk(data: any[]): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/Insert_Request_Bulk`, data);
  }

  get_ItemNo(): Observable<any> { // ฟังก์ชันสำหรับดึงหมายเลขชิ้นส่วน
    if (!this.itemNoCache$) {
      this.itemNoCache$ = this.httpClient.get(`${this.baseUrl}/get_ItemNo`).pipe(
        shareReplay(1)
      );
    }
    return this.itemNoCache$;
  }

  getItemDetailsByNo(itemNo: string, divisionId: string | number): Observable<any> {
    // ใช้ endpoint จาก Return.controller ที่รองรับการหาข้อมูลรายชิ้นอยู่แล้ว
    return this.httpClient.get(`${this.baseUrl}/return/item/${itemNo}`, {
      params: { divisionId: String(divisionId), isAutocomplete: 'false' }
    });
  }
}
