import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root' // ระบุว่า service นี้จะถูกให้บริการใน root module
})

export class LoginService {

  private baseUrl = environment.apiUrl

  constructor(private http: HttpClient) { }

  // ฟังก์ชันสำหรับการเข้าสู่ระบบ
  login(credentials: { Username: string; Password: string; ConfirmForce?: boolean }): Observable<any> {
    return this.http.post(`${this.baseUrl}/login`, credentials);
  }

}
