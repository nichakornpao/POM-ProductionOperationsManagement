import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class MasterPHService {

    private baseUrl = environment.apiUrl;

    constructor(private http: HttpClient) { }

    importIReport(data: FormData): Observable<any> {
        return this.http.post<any>(`${this.baseUrl}/master-ph/import-ireport`, data);
    }

    importPartItem2(data: FormData): Observable<any> {
        return this.http.post<any>(`${this.baseUrl}/master-ph/import-part-item-2`, data);
    }

    purgePartItem2(): Observable<any> {
        return this.http.delete<any>(`${this.baseUrl}/master-ph/purge-part-item-2`);
    }

    getPartItem2(): Observable<any> {
        return this.http.get<any>(`${this.baseUrl}/master-ph/part-item-2`);
    }

    importMasterToolingPMC(data: FormData, recorderId?: string): Observable<any> {
        const url = recorderId
            ? `${this.baseUrl}/master-ph/import-master-tooling-pmc?employeeId=${recorderId}`
            : `${this.baseUrl}/master-ph/import-master-tooling-pmc`;
        return this.http.post<any>(url, data);
    }

    importMasterToolingGM(data: FormData, recorderId?: string): Observable<any> {
        const url = recorderId
            ? `${this.baseUrl}/master-ph/import-master-tooling-gm?employeeId=${recorderId}`
            : `${this.baseUrl}/master-ph/import-master-tooling-gm`;
        return this.http.post<any>(url, data);
    }

    syncMasterToolingGM(): Observable<any> {
        return this.http.post<any>(`${this.baseUrl}/master-ph/sync-gm`, {});
    }
}
