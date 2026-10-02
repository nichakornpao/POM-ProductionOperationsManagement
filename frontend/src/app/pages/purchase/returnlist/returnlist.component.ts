import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { SidebarPurchaseComponent } from '../../../components/sidebar/sidebarPurchase.component';
import { NotificationPurchaseComponent } from '../../../components/notification/notificationPurchase.component';
import { RouterOutlet, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
// Using ReturnService if available, otherwise just mock
import { ReturnService } from '../../../core/services/return.service';

import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
    selector: 'app-returnlist',
    standalone: true,
    imports: [
        RouterOutlet,
        SidebarPurchaseComponent,
        NotificationPurchaseComponent,
        FormsModule,
        NgSelectModule,
        CommonModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatFormFieldModule,
        MatInputModule
    ],
    templateUrl: './returnlist.component.html',
    styleUrl: './returnlist.component.scss'
})
export class ReturnlistComponent implements OnInit {
    returns: any[] = [];

    divisionList: { label: string; value: string }[] = [
        { label: 'GM', value: '7122' },
        { label: 'PMC', value: '71DZ' }
    ];
    statusList: { label: string; value: string }[] = [];

    // Filters
    Division_: string | null = null;
    Status_: string | null = null;
    dateFilter: string | null = null;

    DocNoFilter_: string | null = null;
    ReturnDateFilter_: string | null = null;
    ProcessFilter_: string | null = null;
    FacFilter_: string | null = null;
    PartNoFilter_: string | null = null;
    ItemNoFilter_: string | null = null;

    // Toggle for Complete Items
    showCompleted: boolean = false;

    // Dropdown Lists
    DocNoList: any[] = [];
    ProcessList: any[] = [];
    FacList: any[] = [];
    PartNoList: any[] = [];
    ItemNoList: any[] = [];

    // Sorting
    sortKey: string = '';
    sortAsc: boolean = true;

    filteredReturns: any[] = [];

    // Pagination
    currentPage: number = 1;
    pageSize: number = 20;
    totalPages: number = 1;
    displayedReturns: any[] = [];
    pages: number[] = [];

    // Checkbox State
    selectAllChecked: boolean = false;

    constructor(
        private returnService: ReturnService,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            this.loadReturns();
        }
    }

    loadReturns() {
        this.returnService.getReturnHistory().subscribe({
            next: (data) => {
                this.returns = data.map(item => ({ ...item, Selection: false })); // Add Selection property
                this.populateDropdowns();
                this.onFilter();
            },
            error: (err) => {
                console.error('Error fetching return list:', err);
            }
        });
    }

    populateDropdowns() {
        // Extract unique Statuses from all data
        const getUniqueList = (key: string) => [...new Set(this.returns.map(item => item[key]).filter(x => x))].sort().map(x => ({ label: x, value: x }));

        this.statusList = getUniqueList('Status');
        this.DocNoList = getUniqueList('Doc_No');
        this.ProcessList = getUniqueList('Process');
        this.FacList = getUniqueList('Facility');
        this.PartNoList = getUniqueList('PartNo');
        this.ItemNoList = getUniqueList('ItemNo');
    }

    onFilter() {
        this.selectAllChecked = false; // Reset select all

        if (!this.Division_) {
            this.filteredReturns = [];
            this.displayedReturns = [];
            this.updatePagination();
            return;
        }

        this.filteredReturns = this.returns.filter(item => {
            const matchDivision = item.Division === this.Division_;

            // Column Filters
            const matchDocNo = !this.DocNoFilter_ || item.Doc_No === this.DocNoFilter_;
            const matchProcess = !this.ProcessFilter_ || item.Process === this.ProcessFilter_;
            const matchFac = !this.FacFilter_ || item.Facility == this.FacFilter_;
            const matchPartNo = !this.PartNoFilter_ || (item.PartNo && item.PartNo.toLowerCase().includes(this.PartNoFilter_.toLowerCase()));
            const matchItemNo = !this.ItemNoFilter_ || (item.ItemNo && item.ItemNo.toLowerCase().includes(this.ItemNoFilter_.toLowerCase()));

            let matchReturnDate = true;
            if (this.ReturnDateFilter_) {
                const filterDate = new Date(this.ReturnDateFilter_);
                filterDate.setHours(0, 0, 0, 0);
                const itemDate = new Date(item.Return_Date);
                itemDate.setHours(0, 0, 0, 0);
                matchReturnDate = itemDate.getTime() === filterDate.getTime();
            }

            // Status Filter Logic
            // Toggle OFF: Show Incomplete (Active)
            // Toggle ON: Show Complete (History)
            let matchStatus = true;
            if (this.showCompleted) {
                matchStatus = item.Status === 'Complete';
            } else {
                matchStatus = item.Status !== 'Complete';
            }

            return matchDivision && matchDocNo && matchProcess && matchFac && matchPartNo && matchItemNo && matchReturnDate && matchStatus;
        });
        this.currentPage = 1;
        this.updatePagination();
    }

    clearFilters() {
        // this.Division_ = null; // Keep Division as requested
        this.Status_ = null;
        this.dateFilter = null;

        this.DocNoFilter_ = null;
        this.ProcessFilter_ = null;
        this.FacFilter_ = null;
        this.PartNoFilter_ = null;
        this.ItemNoFilter_ = null;
        this.ReturnDateFilter_ = null;

        // Optional: Reset showCompleted? 
        // User said "filters in table". showCompleted is a toggle. 
        // Let's reset it to default (false) to be safe, or keep it?
        // Usually 'Clear' resets to default state.
        this.showCompleted = false;

        this.onFilter();
    }

    onSort(key: string) {
        if (this.sortKey === key) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortKey = key;
            this.sortAsc = true;
        }

        this.filteredReturns.sort((a, b) => {
            const valA = a[key] ?? '';
            const valB = b[key] ?? '';

            if (key.includes('Date')) {
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

        this.updatePagination();
    }

    updatePagination() {
        this.totalPages = Math.ceil(this.filteredReturns.length / this.pageSize) || 1;
        if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIndex = (this.currentPage - 1) * this.pageSize;
        this.displayedReturns = this.filteredReturns.slice(startIndex, startIndex + this.pageSize);

        // Simple pagination logic
        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(this.totalPages, startPage + 4);
        if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

        this.pages = [];
        for (let i = startPage; i <= endPage; i++) {
            this.pages.push(i);
        }
    }

    onPageChange(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.updatePagination();
        }
    }

    toggleAllCheckboxes() {
        this.filteredReturns.forEach(item => item.Selection = this.selectAllChecked);
    }

    fileName = "ReturnList_Export.xlsx";

    exportToExcel() {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        // 1. Get filtered items (if any selection, prioritize selected?) 
        // Logic: If items are selected, export only selected. Else export all filtered.
        const selectedItems = this.filteredReturns.filter(item => item.Selection);
        const dataSource = selectedItems.length > 0 ? selectedItems : this.filteredReturns;

        if (dataSource.length === 0) {
            Swal.fire({ icon: 'warning', title: 'No Data', text: 'No items to export.', timer: 1500, showConfirmButton: false });
            return;
        }

        // 2. Map data
        const dataToExport = dataSource.map((item, index) => ({
            'Document No': item.Doc_No || '',
            'Return Date': item.Return_Date ? new Date(item.Return_Date).toLocaleDateString('en-GB') : '',
            'Division': item.Division || '',
            'Process': item.Process || '',
            'Facility': item.Facility || '',
            'Part No.': item.PartNo || '',
            'Item No.': item.ItemNo || '',
            'Item Name': item.ItemName || '',
            'Spec': item.Spec || '',
            'QTY': item.QTY || 0,
            'Usage': item.Used_Qty !== null && item.Used_Qty !== undefined ? item.Used_Qty : '',
            'Phone No': item.Phone_No || ''
        }));

        // 3. Generate Worksheet
        const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(dataToExport);

        // 4. Create Workbook
        const wb: XLSX.WorkBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ReturnList');

        // 5. Save
        XLSX.writeFile(wb, this.fileName);
    }

    onClear() {
        // console.log('Clear clicked'); // Removed excessive logging
        this.clearFilters();
    }

    onComplete() {
        const selectedItems = this.filteredReturns.filter(item => item.Selection);

        if (selectedItems.length === 0) {
            Swal.fire({ icon: 'warning', title: 'Start Select Item', text: 'Please select at least one item.', timer: 1500, showConfirmButton: false });
            return;
        }

        Swal.fire({
            title: 'Are you sure?',
            text: `You are about to complete ${selectedItems.length} items.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, complete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                // Bulk Update using forkJoin
                const updateObservables = selectedItems.map(item =>
                    this.returnService.updateReturnStatus({
                        id: item.Return_ID,
                        status: 'Complete',
                        updateBy: 'User' // Replace with actual user if available
                    })
                );

                forkJoin(updateObservables).subscribe({
                    next: () => {
                        this.loadReturns(); // Reload data
                        Swal.fire({ icon: 'success', title: 'Completed!', text: 'Selected items have been completed.', timer: 1500, showConfirmButton: false });
                    },
                    error: (err) => {
                        console.error('Bulk update error:', err);
                        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to update some items.' });
                    }
                });
            }
        });
    }

    confirmReturn(item: any) {
        if (item.Status === 'Complete') return;

        Swal.fire({
            title: 'Confirm Return?',
            text: `Item: ${item.ItemNo}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Confirm',
            cancelButtonText: 'Cancel'
        }).then((result) => {
            if (result.isConfirmed) {
                this.returnService.updateReturnStatus({
                    id: item.Return_ID,
                    status: 'Complete',
                    updateBy: 'User' // Replace with actual user
                }).subscribe({
                    next: () => {
                        item.Status = 'Complete'; // Optimistic update
                        Swal.fire({ icon: 'success', title: 'Success', text: 'Item confirmed successfully', timer: 1500, showConfirmButton: false });
                        this.loadReturns(); // Refresh to be sure
                    },
                    error: (err) => {
                        console.error('Update status error:', err);
                        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to confirm item.' });
                    }
                });
            }
        });
    }
}
