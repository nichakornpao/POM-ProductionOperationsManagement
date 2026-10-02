import { Component, OnInit, afterNextRender, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarPurchaseComponent } from '../../../components/sidebar/sidebarPurchase.component';
import { MasterPHService } from '../../../core/services/MasterPH.service';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

@Component({
    selector: 'app-master-ph',
    standalone: true,
    imports: [CommonModule, SidebarPurchaseComponent, FormsModule],
    templateUrl: './MasterPH.component.html',
    styleUrls: ['./MasterPH.component.scss']
})
export class MasterPHComponent {

    masterData: any[] = [];
    loading: boolean = false;

    // Master Tooling PMC
    masterToolingPMCFileName: string = '';
    uploadingPMC: boolean = false;
    uploadProgressPMC: number = 0;
    summaryPMC: any = null;

    // Master Tooling GM
    masterToolingGMFileName: string = '';
    uploadingGM: boolean = false;
    uploadProgressGM: number = 0;
    summaryGM: any = null;

    tempData: any = {
        masterToolingPMC: null,
        masterToolingGM: null
    };

    constructor(private masterPHService: MasterPHService, private ngZone: NgZone) { }

    // Generic file handler helper
    handleFile(evt: any, type: 'masterToolingPMC' | 'masterToolingGM') {
        const target: DataTransfer = <DataTransfer>(evt.target);
        if (target.files.length !== 1) {
            Swal.fire('Error', 'Cannot use multiple files', 'error');
            return;
        }

        const file = target.files[0];
        const fileName = file.name;

        if (type === 'masterToolingPMC') {
            this.masterToolingPMCFileName = fileName;
            this.summaryPMC = null; // reset summary on new file
        } else if (type === 'masterToolingGM') {
            this.masterToolingGMFileName = fileName;
            this.summaryGM = null;
        }

        // console.log(`[MasterPH] Selected file for ${type}: ${fileName}`);
        this.tempData[type] = file;
        evt.target.value = '';
    }

    onFileChangeMasterToolingPMC(evt: any) { this.handleFile(evt, 'masterToolingPMC'); }
    onFileChangeMasterToolingGM(evt: any) { this.handleFile(evt, 'masterToolingGM'); }

    // Mock progress function for UI demonstration
    simulateProgress(type: 'PMC' | 'GM', callback: () => void) {
        if (type === 'PMC') {
            this.uploadingPMC = true;
            this.uploadProgressPMC = 0;
            this.summaryPMC = null;
        } else {
            this.uploadingGM = true;
            this.uploadProgressGM = 0;
            this.summaryGM = null;
        }

        this.ngZone.runOutsideAngular(() => {
            const interval = setInterval(() => {
                this.ngZone.run(() => {
                    if (type === 'PMC') {
                        this.uploadProgressPMC += Math.floor(Math.random() * 15) + 5;
                        if (this.uploadProgressPMC >= 100) {
                            this.uploadProgressPMC = 100;
                            clearInterval(interval);
                            setTimeout(() => callback(), 500); // slight delay at 100%
                        }
                    } else {
                        this.uploadProgressGM += Math.floor(Math.random() * 15) + 5;
                        if (this.uploadProgressGM >= 100) {
                            this.uploadProgressGM = 100;
                            clearInterval(interval);
                            setTimeout(() => callback(), 500);
                        }
                    }
                });
            }, 300);
        });
    }

    uploadData(type: 'masterTooling') {
        if (type === 'masterTooling') {
            const data = this.tempData.masterToolingPMC;
            if (!data) {
                Swal.fire('Warning', 'No Master Tooling PMC file selected', 'warning');
                return;
            }
            // Start mock progress -> then trigger actual upload logic
            this.simulateProgress('PMC', () => this.importMasterToolingPMC(data as any));
        }
    }

    uploadDataGM() {
        const data = this.tempData.masterToolingGM;
        if (!data) {
            Swal.fire('Warning', 'No Master Tooling GM file selected', 'warning');
            return;
        }

        // Trigger actual upload logic
        this.simulateProgress('GM', () => this.importMasterToolingGM(data as any));
    }

    importMasterToolingGM(file: File) {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        const _u = JSON.parse(sessionStorage.getItem('user') || '{}');
        const _empId: string | undefined = _u.Employee_ID || _u.employee_id || undefined;

        this.masterPHService.importMasterToolingGM(formData, _empId).subscribe({
            next: (res: any) => {
                this.uploadingGM = false;
                this.summaryGM = { total: res.totalInputRows ?? 0 };

                Swal.fire({
                    title: 'Import Successful!',
                    html: `<div class="text-start">
                        <p class="mb-1"><strong>Total input rows:</strong> ${res.totalInputRows ?? 0}</p>
                        <p class="mb-0 text-success">✅ All records imported successfully</p>
                    </div>`,
                    icon: 'success'
                });

                this.masterToolingGMFileName = '';
                this.tempData.masterToolingGM = null;
            },
            error: (err: any) => {
                console.error('Import Master Tooling GM Error:', err);
                this.uploadingGM = false;

                const unmatchedRows: any[] = err.error?.unmatchedRows;

                if (unmatchedRows && unmatchedRows.length > 0) {
                    // ─── Distinct by PartNo ───
                    const seen = new Set<string>();
                    const distinctRows: any[] = [];
                    for (const r of unmatchedRows) {
                        if (!seen.has(r.PartNo)) {
                            seen.add(r.PartNo);
                            distinctRows.push(r);
                        }
                    }

                    // Sort by Process then PartNo
                    distinctRows.sort((a, b) => {
                        const pa = (a.Process || '').localeCompare(b.Process || '');
                        return pa !== 0 ? pa : (a.PartNo || '').localeCompare(b.PartNo || '');
                    });

                    // ─── Build single-sheet Excel ───
                    const wb = XLSX.utils.book_new();

                    const titleRow = ['รายการ Error โปรดตรวจสอบ PartNo ว่าตรงตาม Layout หรือไม่', '', '', '', ''];
                    const headerRow = ['No.', 'Part No.', 'Process', 'MC', 'Excel Row'];
                    const dataRows = distinctRows.map((r: any, i: number) => [
                        i + 1,
                        r.PartNo || '',
                        r.Process || '',
                        r.MC || '',
                        r.ExcelRow || ''
                    ]);

                    const ws = XLSX.utils.aoa_to_sheet([titleRow, headerRow, ...dataRows]);

                    // Merge title row across 5 columns (A1:E1)
                    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

                    if (ws['A1']) {
                        ws['A1'].s = {
                            font: { bold: true, sz: 14 },
                            alignment: { horizontal: 'center', vertical: 'center' }
                        };
                    }

                    // Column widths
                    ws['!cols'] = [
                        { wch: 6 },  // No.
                        { wch: 20 },  // Part No.
                        { wch: 18 },  // Process
                        { wch: 14 },  // MC
                        { wch: 10 }   // Excel Row
                    ];

                    XLSX.utils.book_append_sheet(wb, ws, 'Error List');

                    const today = new Date().toISOString().slice(0, 10);
                    XLSX.writeFile(wb, `Unmatched_Parts_GM_${today}.xlsx`);

                    // Show warning dialog
                    Swal.fire({
                        icon: 'warning',
                        title: 'Failed Unmatched Part No.',
                        html: `<div class="text-start">
                            <p class="mb-1">พบ <strong>${distinctRows.length} Part No.</strong> ที่ไม่พบในระบบ</p>
                            <p class="text-success mb-0">ผมได้ดาวน์โหลด Excel รายการที่เกิดError ให้แล้วครับ<br>
                            <small>(<strong>Unmatched_Parts_GM_${today}.xlsx</strong>)</small></p>
                        </div>`,
                        confirmButtonText: 'OK'
                    });
                    return;
                }

                // Generic error
                const errorMsg = err.error?.message || err.error?.error || err.message || 'Unknown error';
                Swal.fire('Error', `Failed to import: ${errorMsg}`, 'error');
            }
        });
    }

    importMasterToolingPMC(file: File) {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        const _u = JSON.parse(sessionStorage.getItem('user') || '{}');
        const _empId: string | undefined = _u.Employee_ID || _u.employee_id || undefined;

        this.masterPHService.importMasterToolingPMC(formData, _empId).subscribe({
            next: (res: any) => {
                this.uploadingPMC = false;
                this.summaryPMC = { total: res.totalInputRows ?? 0 };

                const unmatchedRows: any[] = res.unmatchedRows;
                if (unmatchedRows && unmatchedRows.length > 0) {
                    this.processUnmatchedRows(unmatchedRows, res.totalInputRows ?? 0, true);
                } else {
                    Swal.fire({
                        title: 'Import Successful!',
                        html: `<div class="text-start">
                            <p class="mb-1"><strong>Total input rows:</strong> ${res.totalInputRows ?? 0}</p>
                            <p class="mb-0 text-success">✅ All records imported successfully</p>
                        </div>`,
                        icon: 'success'
                    });
                }

                this.masterToolingPMCFileName = '';
                this.tempData.masterToolingPMC = null;
            },
            error: (err: any) => {
                console.error('Import Master Tooling PMC Error:', err);
                this.uploadingPMC = false;

                const unmatchedRows: any[] = err.error?.unmatchedRows;
                if (unmatchedRows && unmatchedRows.length > 0) {
                    this.processUnmatchedRows(unmatchedRows, 0, false);
                    return;
                }

                const errorMsg = err.error?.message || err.error?.error || err.message || 'Unknown error';
                Swal.fire('Error', `Failed to import: ${errorMsg}`, 'error');
            }
        });
    }

    private processUnmatchedRows(unmatchedRows: any[], totalInputRows: number = 0, isPartialSuccess: boolean = false) {
        const seen = new Set<string>();
        const distinctRows: any[] = [];
        for (const r of unmatchedRows) {
            if (!seen.has(r.PartNo)) {
                seen.add(r.PartNo);
                distinctRows.push(r);
            }
        }

        distinctRows.sort((a, b) => {
            const pa = (a.Process || '').localeCompare(b.Process || '');
            return pa !== 0 ? pa : (a.PartNo || '').localeCompare(b.PartNo || '');
        });

        const wb = XLSX.utils.book_new();
        const titleRow = ['รายการ Error / Missing PartNo โปรดตรวจสอบ PartNo ว่าตรงตาม Layout หรือไม่', '', '', '', ''];
        const headerRow = ['No.', 'Part No.', 'Process', 'MC', 'Excel Row'];
        const dataRows = distinctRows.map((r: any, i: number) => [
            i + 1,
            r.PartNo || '',
            r.Process || '',
            r.MC || '',
            r.ExcelRow || ''
        ]);

        const ws = XLSX.utils.aoa_to_sheet([titleRow, headerRow, ...dataRows]);
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
        ws['!cols'] = [
            { wch: 6 },
            { wch: 20 },
            { wch: 18 },
            { wch: 14 },
            { wch: 10 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Error List');
        const today = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `Error_List_Parts_${today}.xlsx`);

        if (isPartialSuccess) {
            Swal.fire({
                icon: 'warning',
                title: 'Import Completed with Warnings',
                html: `<div class="text-start">
                    <p class="mb-1 text-success"><strong>✅ ข้อมูลรายการที่มี PartNo ถูกต้อง ถูกบันทึกเข้าสู่ระบบเรียบร้อยแล้ว</strong></p>
                    <p class="mb-1">พบ <strong>${distinctRows.length} Part No. (${unmatchedRows.length} แถว)</strong> ที่ไม่พบในระบบและถูกข้าม</p>
                    <p class="text-primary mb-0">ระบบได้ดาวน์โหลดไฟล์ Excel สรุปรายการที่ข้ามให้เรียบร้อยแล้วครับ<br>
                    <small>(<strong>Error_List_Parts_${today}.xlsx</strong>)</small></p>
                </div>`,
                confirmButtonText: 'OK'
            });
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Failed Unmatched Part No.',
                html: `<div class="text-start">
                    <p class="mb-1">พบ <strong>${distinctRows.length} Part No.</strong> ที่ไม่พบในระบบ</p>
                    <p class="text-success mb-0">ผมได้ดาวน์โหลด Excel รายการที่เกิดError ให้แล้วครับ<br>
                    <small>(<strong>Error_List_Parts_${today}.xlsx</strong>)</small></p>
                </div>`,
                confirmButtonText: 'OK'
            });
        }
    }

    // syncGMData() method removed as it was replaced by uploadDataGM()

}
