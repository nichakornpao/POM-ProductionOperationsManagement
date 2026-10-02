import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { arrayBuffer } from 'node:stream/consumers';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root' // ระบุว่า service นี้จะถูกให้บริการใน root module
})

export class FileReadService {

    private baseUrl = environment.apiUrl

    public user: any;

    constructor( // คอนสตรัคเตอร์ของ service
    private httpClient: HttpClient // เก็บ HttpClient สำหรับทำ HTTP requests
  ) { }

  loadPdfFromPath(filePath: string): Observable<{ fileName: string, imageData: string }> {
  return this.httpClient.post<{ fileName: string, imageData: string }>(
   ` ${this.baseUrl}/loadPdfFromPath`,
    { filePath }, // ← ส่ง path ที่มาจาก database
  );
}


 }
