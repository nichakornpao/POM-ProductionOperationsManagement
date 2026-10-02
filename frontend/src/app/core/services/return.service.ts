import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class ReturnService {

    private baseUrl = `${environment.apiUrl}`;

    constructor(private http: HttpClient) { }

    getItemDetails(itemNo: string, divisionId: number, isAutocomplete: boolean = false): Observable<any> {
        return this.http.get<any>(`${this.baseUrl}/return/item/${itemNo}?divisionId=${divisionId}&isAutocomplete=${isAutocomplete}`);
    }

    getDocBarcodeDetails(barcode: string): Observable<any> {
        return this.http.get<any>(`${this.baseUrl}/return/doc-barcode/${encodeURIComponent(barcode)}`);
    }

    getPartNo(partNo: string, divisionId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/return/partno/${partNo}?divisionId=${divisionId}`);
    }

    getDivisions(): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/return/divisions`);
    }

    getFacilities(profitCenter: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/return/facilities/${profitCenter}`);
    }

    getProcesses(divisionId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/return/processes/${divisionId}`);
    }

    saveReturnRequest(data: any): Observable<any> {
        return this.http.post<any>(`${this.baseUrl}/return/save`, data);
    }

    getReturnHistory(): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/return/list`);
    }

    getNextDocNo(process: string, facility: string, division: string): Observable<{ docNo: string }> {
        const encodedProcess = encodeURIComponent(process);
        const encodedFacility = encodeURIComponent(facility);
        const encodedDivision = encodeURIComponent(division);
        return this.http.get<{ docNo: string }>(`${this.baseUrl}/return/next-doc-no?process=${encodedProcess}&facility=${encodedFacility}&division=${encodedDivision}`);
    }

    updateReturnStatus(data: { id: number, status: string, updateBy?: string }): Observable<any> {
        return this.http.post<any>(`${this.baseUrl}/return/update-status`, data);
    }

    // --- State Persistence ---
    private returnState: any = null;

    setReturnState(state: any) {
        this.returnState = state;
    }

    getReturnState(): any {
        return this.returnState;
    }

    clearReturnState() {
        this.returnState = null;
    }
}
