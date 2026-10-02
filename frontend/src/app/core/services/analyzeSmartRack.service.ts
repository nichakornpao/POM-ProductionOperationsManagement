import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root' // ระบุว่า service นี้จะถูกให้บริการใน root module
})
export class AnalyzeSmartRackService {

    private baseUrl = environment.apiUrl;

    public user: any;

  constructor(
    private httpClient: HttpClient
  ) { }

getdatasmartrack(): Observable<any> {
    return this.httpClient.get(`${this.baseUrl}/getdatasmartrack`);
    }
}
