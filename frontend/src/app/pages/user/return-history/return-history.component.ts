import { Component, OnInit, HostListener, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { SidebarComponent } from '../../../components/sidebar/sidebar.component';
import { ReturnService } from '../../../core/services/return.service';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

@Component({
    selector: 'app-return-history',
    standalone: true,
    imports: [CommonModule, HttpClientModule, FormsModule, NgSelectModule],
    templateUrl: './return-history.component.html',
    styleUrls: ['./return-history.component.scss']
})
export class ReturnHistoryComponent implements OnInit {
    historyList: any[] = [];
    filteredList: any[] = [];
    paginatedList: any[] = [];
    isLoading: boolean = true;
    selectAllCheck: boolean = false;

    // Dropdown Lists
    divisionList: any[] = [];
    partNoList: any[] = [];
    itemNoList: any[] = [];
    docNoList: any[] = [];
    itemNameList: any[] = [];
    specList: any[] = [];
    statusList: any[] = [];

    // Filter Models
    selectedDivisions: any[] = [];
    selectedPartNos: any[] = [];
    selectedItemNos: any[] = [];
    selectedDocNos: any[] = [];
    selectedItemNames: any[] = [];
    selectedSpecs: any[] = [];
    selectedStatuses: any[] = [];
    fromDate: string = '';
    toDate: string = '';

    // Pagination
    currentPage: number = 1;
    pageSize: number = 20;
    totalPages: number = 1;
    pages: number[] = [];

    // Sorting
    sortKey: string = '';
    sortAsc: boolean = true;

    // Filter Popup State
    activeFilter: string | null = null;

    fileName = "ReturnHistory.xlsx";

    constructor(
        private returnService: ReturnService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    ngOnInit() {
        this.loadHistory();
    }

    loadHistory() {
        this.isLoading = true;
        this.returnService.getReturnHistory().subscribe({
            next: (data) => {
                // IMPORTANT: Only process data if in browser. 
                // We keep isLoading = true on the server to prevent SSR from rendering the "No Data" row prematurely.
                if (!isPlatformBrowser(this.platformId)) {
                    return; 
                }

                const userStr = sessionStorage.getItem('user');
                if (userStr) {
                    try {
                        const currentUser = JSON.parse(userStr);
                        if (currentUser.Role?.toLowerCase() === 'production') {
                            const targetId = (currentUser.Employee_ID || '').toString().trim().toLowerCase();
                            data = data.filter((item: any) => {
                                const empId = (item.Employee_ID || item.EmployeeID || '').toString().trim().toLowerCase();
                                return empId === targetId;
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing user session', e);
                    }
                }

                this.historyList = data.map(item => ({
                    ...item,
                    Selection: false, // For checkbox
                    // Ensure fields are strings for search
                    Division: item.Division || '',
                    PartNo: item.PartNo || '',
                    ItemNo: item.ItemNo || '',
                    Doc_No: item.Doc_No || '',
                    Remark: item.Remark || '',
                    Status: item.Status || 'Pending',
                    Used_Qty: item.Used_Qty
                }));

                this.extractDropdowns();
                this.filteredList = [...this.historyList];
                this.updatePaginatedList();
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading history:', err);
                this.isLoading = false;
                Swal.fire('Error', 'Failed to load history data.', 'error');
            }
        });
    }

    // 🔄 Scroll Sync Logic
    syncScroll(source: HTMLElement, target: HTMLElement) {
        if (source.scrollLeft !== target.scrollLeft) {
            target.scrollLeft = source.scrollLeft;
        }
    }

    extractDropdowns(sourceList: any[] = this.historyList) {
        this.divisionList = [...new Set(sourceList.map(i => i.Division))].filter(x => x).map(x => ({ label: x, value: x }));
        this.partNoList = [...new Set(sourceList.map(i => i.PartNo))].filter(x => x).map(x => ({ label: x, value: x }));
        this.itemNoList = [...new Set(sourceList.map(i => i.ItemNo))].filter(x => x).map(x => ({ label: x, value: x }));
        this.docNoList = [...new Set(sourceList.map(i => i.Doc_No))].filter(x => x).map(x => ({ label: x, value: x }));
        this.itemNameList = [...new Set(sourceList.map(i => i.ItemName))].filter(x => x).map(x => ({ label: x, value: x }));
        this.specList = [...new Set(sourceList.map(i => i.Spec))].filter(x => x).map(x => ({ label: x, value: x }));
        this.statusList = [...new Set(sourceList.map(i => i.Status))].filter(x => x).map(x => ({ label: x, value: x }));
    }

    toggleFilter(column: string) {
        this.activeFilter = this.activeFilter === column ? null : column;
    }

    @HostListener('document:click', ['$event'])
    closeFilter(event: Event) {
        const target = event.target as HTMLElement;
        if (!target.closest('.filter-wrapper')) {
            this.activeFilter = null;
        }
    }

    onFilter() {
        this.filteredList = this.historyList.filter(item => this.checkItemMatch(item));
        this.currentPage = 1;
        this.updatePaginatedList();
        this.updateDropdownsCascading();
    }

    checkItemMatch(item: any, ignoreKey: string = ''): boolean {
        // Filter by Dropdowns (Multi-select)
        const matchDivision = ignoreKey === 'Division' || !this.selectedDivisions?.length || this.selectedDivisions.includes(item.Division);
        const matchPartNo = ignoreKey === 'PartNo' || !this.selectedPartNos?.length || this.selectedPartNos.includes(item.PartNo);
        const matchItemNo = ignoreKey === 'ItemNo' || !this.selectedItemNos?.length || this.selectedItemNos.includes(item.ItemNo);
        const matchDocNo = ignoreKey === 'Doc_No' || !this.selectedDocNos?.length || this.selectedDocNos.includes(item.Doc_No);
        const matchItemName = ignoreKey === 'ItemName' || !this.selectedItemNames?.length || this.selectedItemNames.includes(item.ItemName);
        const matchSpec = ignoreKey === 'Spec' || !this.selectedSpecs?.length || this.selectedSpecs.includes(item.Spec);
        const matchStatus = ignoreKey === 'Status' || !this.selectedStatuses?.length || this.selectedStatuses.includes(item.Status);

        // Filter by Date
        let matchDate = true;
        if (ignoreKey !== 'Return_Date' && (this.fromDate || this.toDate)) {
            const dateToCheck = item.Return_Date || item.DateTime_Record;
            const itemDate = new Date(dateToCheck);
            itemDate.setHours(0, 0, 0, 0);

            if (this.fromDate) {
                const start = new Date(this.fromDate);
                start.setHours(0, 0, 0, 0);
                if (itemDate < start) matchDate = false;
            }
            if (this.toDate) {
                const end = new Date(this.toDate);
                end.setHours(0, 0, 0, 0);
                if (itemDate > end) matchDate = false;
            }
        }

        return matchDivision && matchPartNo && matchItemNo && matchDocNo && matchItemName && matchSpec && matchStatus && matchDate;
    }

    updateDropdownsCascading() {
        this.divisionList = this.getUniqueValues('Division');
        this.partNoList = this.getUniqueValues('PartNo');
        this.itemNoList = this.getUniqueValues('ItemNo');
        this.docNoList = this.getUniqueValues('Doc_No');
        this.itemNameList = this.getUniqueValues('ItemName');
        this.specList = this.getUniqueValues('Spec');
        this.statusList = this.getUniqueValues('Status');
    }

    getUniqueValues(key: string): any[] {
        const list = this.historyList
            .filter(item => this.checkItemMatch(item, key))
            .map(item => item[key]);
        return [...new Set(list)].filter(x => x).sort().map(x => ({ label: x, value: x }));
    }

    clearFilters() {
        this.activeFilter = null;
        this.selectedDivisions = [];
        this.selectedPartNos = [];
        this.selectedItemNos = [];
        this.selectedDocNos = [];
        this.selectedItemNames = [];
        this.selectedSpecs = [];
        this.selectedStatuses = [];
        this.fromDate = '';
        this.toDate = '';
        this.currentPage = 1;
        this.onFilter();
    }

    clearAll() {
        Swal.fire({
            title: 'Are you sure?',
            text: "ระบบจะทำการล้างรายการตัวกรองทั้งหมด",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, clear all!'
        }).then((result) => {
            if (result.isConfirmed) {
                this.clearFilters();
                Swal.fire({
                    title: 'Cleared!',
                    text: 'ตัวกรองทั้งหมดถูกล้างเรียบร้อยแล้ว',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    }


    setDivisionFilter(div: string) {
        this.selectedPartNos = [];
        this.selectedItemNos = [];
        this.selectedDocNos = [];
        this.selectedItemNames = [];
        this.selectedSpecs = [];
        this.selectedStatuses = [];
        this.fromDate = '';
        this.toDate = '';

        if (!div) {
            this.selectedDivisions = [];
        } else {
            this.selectedDivisions = [div];
        }
        this.onFilter();
    }

    // Sorting Logic
    onSort(key: string) {
        if (this.sortKey === key) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortKey = key;
            this.sortAsc = true;
        }

        this.filteredList.sort((a, b) => {
            const valA = a[key] ?? '';
            const valB = b[key] ?? '';

            if (key === 'DateTime_Record' || key === 'Return_Date' || key === 'DateComplete') {
                const dateA = new Date(valA).getTime();
                const dateB = new Date(valB).getTime();
                return this.sortAsc ? dateA - dateB : dateB - dateA;
            }

            if (typeof valA === 'number' && typeof valB === 'number') {
                return this.sortAsc ? valA - valB : valB - valA;
            }

            return this.sortAsc
                ? String(valA).localeCompare(String(valB))
                : String(valB).localeCompare(String(valA));
        });

        this.currentPage = 1;
        this.updatePaginatedList();
    }

    // 📄 Pagination Logic
    updatePaginatedList() {
        this.totalPages = Math.ceil(this.filteredList.length / this.pageSize);
        if (this.totalPages < 1) this.totalPages = 1;

        if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        this.paginatedList = this.filteredList.slice(startIndex, endIndex);

        this.generatePageNumbers();
    }

    generatePageNumbers() {
        const pagesToShow = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(pagesToShow / 2));
        let endPage = Math.min(this.totalPages, startPage + pagesToShow - 1);

        if (endPage - startPage + 1 < pagesToShow) {
            startPage = Math.max(1, endPage - pagesToShow + 1);
        }

        this.pages = [];
        for (let i = startPage; i <= endPage; i++) {
            this.pages.push(i);
        }
    }

    setPage(page: number) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.updatePaginatedList();

        const table = document.querySelector('.table-responsive');
        if (table) table.scrollTop = 0;
    }

    // Checkbox Logic
    toggleAllCheckboxes() {
        this.filteredList.forEach(item => item.Selection = this.selectAllCheck);
    }

    onCheckboxChange(item: any) {
        // If one is unchecked, uncheck "Select All"
        if (!item.Selection) {
            this.selectAllCheck = false;
        }
    }

    getRowClass(item: any): string {
        return item.Selection ? 'row-selected' : '';
    }

    // Export Logic
    exportExcel() {
        const selected = this.filteredList.filter(i => i.Selection);
        const dataToExport = selected.length > 0 ? selected : this.filteredList; // Export selected or all visible

        if (dataToExport.length === 0) {
            Swal.fire('Warning', 'No data to export', 'warning');
            return;
        }

        // Map to nice column names
        const exportData = dataToExport.map((item, index) => ({
            'No.': index + 1,
            'Doc No': item.Doc_No,
            'Return Date': item.Return_Date ? new Date(item.Return_Date).toLocaleDateString('en-GB') : (item.DateTime_Record ? new Date(item.DateTime_Record).toLocaleDateString('en-GB') : ''),
            'Date Complete': item.DateComplete ? new Date(item.DateComplete).toLocaleDateString('en-GB') : '',
            'Employee ID': item.Employee_ID,
            'Return By': item.Return_By,
            'Division': item.Division,
            'Facility': item.Facility,
            'Part No': item.PartNo,
            'Item Name': item.ItemName,
            'Spec': item.Spec,
            'QTY': item.QTY,
            'Usage': item.Used_Qty !== null && item.Used_Qty !== undefined ? item.Used_Qty : '',
            'Remark': item.Remark,
            'Status': item.Status
        }));

        const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(exportData);
        const wb: XLSX.WorkBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'History');
        XLSX.writeFile(wb, this.fileName);
    }

    // Placeholder for AS400 Button (if visual only for now)
    exportAS400() {
        Swal.fire('Info', 'AS400 Export not configured for Return History yet.', 'info');
    }
}
