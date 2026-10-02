import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import Swal from 'sweetalert2';
import { PurchaseRequestService } from '../../../core/services/PurchaseRequest.service';
import { isPlatformBrowser } from '@angular/common';
import { Inject, PLATFORM_ID } from '@angular/core';
import * as XLSX from 'xlsx';

@Component({
    selector: 'app-request-history',
    standalone: true,
    imports: [CommonModule, FormsModule, NgSelectModule],
    templateUrl: './request-history.component.html',
    styleUrls: ['./request-history.component.scss']
})
export class RequestHistoryComponent implements OnInit {
    historyList: any[] = [];
    filteredList: any[] = [];
    groupedList: any[] = [];
    paginatedGroupedList: any[] = [];
    isLoading: boolean = true;

    // Dropdown Lists for Filtering
    divisionList: any[] = [];
    partNoList: any[] = [];
    processList: any[] = [];
    itemNoList: any[] = [];
    statusList: any[] = [];

    // Filter Models
    selectedDivisions: any[] = [];
    selectedPartNos: any[] = [];
    selectedProcesses: any[] = [];
    selectedItemNos: any[] = [];
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

    fileName = "RequestHistory.xlsx";

    constructor(
        private purchaseService: PurchaseRequestService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    ngOnInit() {
        this.loadHistory();
    }

    loadHistory() {
        this.isLoading = true;
        this.purchaseService.Purchase_Request().subscribe({
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
                                const empId = (item.Requester || item.EmployeeID || '').toString().trim().toLowerCase();
                                return empId === targetId;
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing user session', e);
                    }
                }

                this.historyList = data;
                this.extractDropdowns();
                this.filteredList = [...this.historyList];
                this.groupedList = this.groupData(this.filteredList);

                // Set initial sort to newest first
                this.sortKey = 'DateTime_Record';
                this.sortAsc = false;
                this.groupedList.sort((a, b) => {
                    const dateA = new Date(a.DateTime_Record ?? '').getTime();
                    const dateB = new Date(b.DateTime_Record ?? '').getTime();
                    return dateB - dateA;
                });

                this.updatePaginatedList();
                this.isLoading = false;
            },
            error: (err) => {
                console.error("Error loading history:", err);
                this.isLoading = false;
                if (isPlatformBrowser(this.platformId)) {
                    Swal.fire('Error', 'ไม่สามารถดึงข้อมูลประวัติได้', 'error');
                }
            }
        });
    }



    // 📦 Data Grouping Logic
    groupData(list: any[]): any[] {
        const map = new Map<string, any>();
        list.forEach(item => {
            const key = item.MR_No || item.ID_Request || `REQ-UNKNOWN-${item.Public_Id}`;
            if (!map.has(key)) {
                map.set(key, {
                    MR_No: item.MR_No,
                    DateTime_Record: item.DateTime_Record,
                    Status: item.Status,
                    Division: item.Division,
                    Fac: item.Fac,
                    Requester: item.Requester,
                    DateComplete: item.DateComplete,
                    PhoneNo: item.PhoneNo,
                    isExpanded: false,
                    items: []
                });
            }
            map.get(key).items.push(item);
        });

        // Convert Map to array and sort items within groups
        return Array.from(map.values()).map(group => {
            group.items.sort((a: any, b: any) => {
                const itemA = a.ItemNo || '';
                const itemB = b.ItemNo || '';
                return itemA.localeCompare(itemB, undefined, { numeric: true });
            });

            // Calculate group status: Complete only if ALL items are Complete
            const allComplete = group.items.every((item: any) => item.Status === 'Complete');
            group.Status = allComplete ? 'Complete' : 'Waiting';

            // Set DateComplete to latest completion date among items
            const completedItems = group.items.filter((item: any) => item.DateComplete);
            if (completedItems.length > 0) {
                const latestDate = completedItems.reduce((latest: any, current: any) => {
                    const latestTime = new Date(latest.DateComplete).getTime();
                    const currentTime = new Date(current.DateComplete).getTime();
                    return currentTime > latestTime ? current : latest;
                });
                group.DateComplete = latestDate.DateComplete;
            }

            return group;
        });
    }

    toggleGroup(group: any) {
        group.isExpanded = !group.isExpanded;
    }

    setDivisionFilter(div: string) {
        if (div === '') {
            this.selectedDivisions = [];
        } else {
            this.selectedDivisions = [div];
        }
        this.onFilter();
    }

    extractDropdowns(sourceList: any[] = this.historyList) {
        this.divisionList = [...new Set(sourceList.map(i => i.Division))].filter(x => x).sort().map(x => ({ label: x, value: x }));
        this.partNoList = [...new Set(sourceList.map(i => i.PartNo))].filter(x => x).sort().map(x => ({ label: x, value: x }));
        this.processList = [...new Set(sourceList.map(i => i.Process))].filter(x => x).sort().map(x => ({ label: x, value: x }));
        this.itemNoList = [...new Set(sourceList.map(i => i.ItemNo))].filter(x => x).sort().map(x => ({ label: x, value: x }));
        this.statusList = [...new Set(sourceList.map(i => i.Status))].filter(x => x).sort().map(x => ({ label: x, value: x }));
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
        this.groupedList = this.groupData(this.filteredList);
        this.currentPage = 1; // Reset to page 1 on filter
        this.updatePaginatedList();
        this.updateDropdownsCascading();
    }

    checkItemMatch(item: any, ignoreKey: string = ''): boolean {
        const matchDivision = ignoreKey === 'Division' || !this.selectedDivisions?.length || this.selectedDivisions.includes(item.Division);
        const matchPartNo = ignoreKey === 'PartNo' || !this.selectedPartNos?.length || this.selectedPartNos.includes(item.PartNo);
        const matchProcess = ignoreKey === 'Process' || !this.selectedProcesses?.length || this.selectedProcesses.includes(item.Process);
        const matchItemNo = ignoreKey === 'ItemNo' || !this.selectedItemNos?.length || this.selectedItemNos.includes(item.ItemNo);
        const matchStatus = ignoreKey === 'Status' || !this.selectedStatuses?.length || this.selectedStatuses.includes(item.Status);

        // Date Filter
        let matchDate = true;
        if (ignoreKey !== 'DateTime_Record' && (this.fromDate || this.toDate)) {
            const itemDate = new Date(item.DateTime_Record);
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

        return matchDivision && matchPartNo && matchProcess && matchItemNo && matchStatus && matchDate;
    }

    updateDropdownsCascading() {
        this.divisionList = this.getUniqueValues('Division');
        this.partNoList = this.getUniqueValues('PartNo');
        this.processList = this.getUniqueValues('Process');
        this.itemNoList = this.getUniqueValues('ItemNo');
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
        this.selectedProcesses = [];
        this.selectedItemNos = [];
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

    // Sorting Logic
    onSort(key: string) {
        if (this.sortKey === key) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortKey = key;
            this.sortAsc = true;
        }

        // Sorting operates on the grouped list based on parent aggregations or properties.
        this.groupedList.sort((a, b) => {
            const valA = a[key] ?? '';
            const valB = b[key] ?? '';

            if (key === 'DateTime_Record' || key === 'DueDate' || key === 'DateComplete') {
                const dateA = new Date(valA).getTime() || 0;
                const dateB = new Date(valB).getTime() || 0;
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
        this.totalPages = Math.ceil(this.groupedList.length / this.pageSize);
        if (this.totalPages < 1) this.totalPages = 1;

        // Ensure current page is valid
        if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        this.paginatedGroupedList = this.groupedList.slice(startIndex, endIndex);

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

        // Scroll to top of table
        const table = document.querySelector('.table-responsive');
        if (table) table.scrollTop = 0;
    }

    exportExcel() {
        const dataToExport = this.filteredList;

        if (dataToExport.length === 0) {
            Swal.fire('Warning', 'No data to export', 'warning');
            return;
        }

        const exportData = dataToExport.map((item, index) => ({
            'No.': index + 1,
            'MR NO': item.MR_No || item.ID_Request || '',
            'Status': item.Status || '',
            'Date Complete': item.DateComplete ? new Date(item.DateComplete).toLocaleDateString('en-GB') : '',
            'Orders': item.MFGOrderNo || '',
            'Document': item.DocNo || '',
            'Req Date': item.DateTime_Record ? new Date(item.DateTime_Record).toLocaleDateString('en-GB') : '',
            'Due Date': item.DueDate ? new Date(item.DueDate).toLocaleDateString('en-GB') : '',
            'Req By': item.Requester || '',
            'Div': item.Division || '',
            'Part No': item.PartNo || '',
            'Process': item.Process || '',
            'Fac': item.Fac || '',
            'MC Type': item.MCType || '',
            'MC No': item.MCNo || '',
            'Case': item.CASE || '',
            'Item No': item.ItemNo || '',
            'Item Name': item.ItemName || '',
            'Spec': item.SPEC || '',
            'Req QTY': item.Req_QTY || 0,
            'Issue QTY': item.QTY || 0,
            'Phone': item.PhoneNo || ''
        }));

        const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(exportData);
        const wb: XLSX.WorkBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'History');
        XLSX.writeFile(wb, this.fileName);
    }
}
