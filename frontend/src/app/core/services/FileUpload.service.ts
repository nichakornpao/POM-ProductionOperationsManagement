import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { arrayBuffer } from 'node:stream/consumers';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root' // ระบุว่า service นี้จะถูกให้บริการใน root module
})

export class FileUploadSerice {

  private baseUrl = environment.apiUrl;

    public user: any;

    constructor( // คอนสตรัคเตอร์ของ service
    private httpClient: HttpClient // เก็บ HttpClient สำหรับทำ HTTP requests
  ) { }

    FileUpload(file: File, caseKey: string): Observable<HttpEvent<any>> {
      const formData = new FormData();
      formData.append('file',file);
      formData.append('caseKey',caseKey);
      const req = new HttpRequest('POST',`${this.baseUrl}/FileUpload`,formData,{
        reportProgress:true,
        responseType:'json'
      });
      return this.httpClient.request(req);
    }

  GetImage(caseKey: string): Observable<{ fileName: string, imageData: string }> {
    return this.httpClient.get<{ fileName: string, imageData: string }>(
      `${this.baseUrl}/GetImage/${caseKey}`
    );
  }
  loadPdfFromPath(filePath: string, requestNo?: string): Observable<{ fileName: string, imageData: string }> {
    return this.httpClient.post<{ fileName: string, imageData: string }>(
      `${this.baseUrl}/loadPdfFromPath`,
      { filePath, requestNo },
    );
  }


 }
