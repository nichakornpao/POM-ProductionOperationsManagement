import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {

  private baseUrl = environment.apiUrl;

  public user: any; // ตัวแปรสำหรับเก็บข้อมูลผู้ใช้

  constructor( // คอนสตรัคเตอร์ของ service
    private httpClient: HttpClient // เก็บ HttpClient สำหรับทำ HTTP requests
  ) { }

  get_Employee(): Observable<any> { // ฟังก์ชันสำหรับดึงหมายเลขชิ้นส่วน
    return this.httpClient.get(`${this.baseUrl}/get_Employee`); // ส่ง HTTP GET Division
  }
  addEmployee(data: any): Observable<any> {
    return this.httpClient.post(`${this.baseUrl}/AddEmployee`, data);
  }
  deleteEmployee(empId: string) {
    return this.httpClient.delete(`${this.baseUrl}/delete_employee/${empId}`);
  }
  updateEmployee(payload: any) {
    if (!payload?.Employee_ID) throw new Error('Employee_ID is required');
    return this.httpClient.put(
      `${this.baseUrl}/update/${encodeURIComponent(payload.Employee_ID)}`,
      payload
    );
  }

}
