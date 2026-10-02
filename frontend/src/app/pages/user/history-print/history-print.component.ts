import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DropdownSearchComponent } from '../../../components/dropdown-search/dropdown-search.component';
import { NotificationComponent } from '../../../components/notification/notification.component';
import { NgForOf, isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Inject, PLATFORM_ID } from '@angular/core';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { HistoryPrint } from '../../../core/services/HistoryPrint.service';

@Component({
  selector: 'app-history-print',
  standalone: true,
  imports: [RouterOutlet,
    DropdownSearchComponent,
    NotificationComponent,
    NgForOf,
    CommonModule,
    FormsModule,
    NgSelectModule],
  templateUrl: './history-print.component.html',
  styleUrl: './history-print.component.scss'
})

export class HistoryPrintComponent implements OnInit {

  history: any[] = [];           // เก็บข้อมูลเต็มจาก API
  requests: any[] = [];          // เก็บข้อมูลสำหรับกรอง
  filteredRequests: any[] = [];  // ข้อมูลที่แสดงหลังกรอง
  divisions: string[] = [];      // เก็บ Division ทั้งหมด
  selectedDivision: string | null = null; // Division ที่เลือกใน Dropdown
  sortDesc: boolean = true;      // สถานะการเรียงลำดับ (true = ใหม่ไปเก่า, false = เก่าไปใหม่)
  isLoading: boolean = true;

  constructor(
    private historyService: HistoryPrint,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.isLoading = true;
    this.historyService.HistoryPrint().subscribe({
      next: (response: any[]) => {
        // IMPORTANT: Only process data if in browser. 
        // We keep isLoading = true on the server to prevent SSR from rendering the "No Data" row prematurely.
        if (!isPlatformBrowser(this.platformId)) {
          return; 
        }

        let finalData = [...response];

        // เรียงจากใหม่ไปเก่า (ล่าสุดขึ้นก่อน) เป็นค่าเริ่มต้น
        finalData.sort((a, b) => new Date(b.Date_Record).getTime() - new Date(a.Date_Record).getTime());

        const userStr = sessionStorage.getItem('user');
        if (userStr) {
          try {
            const currentUser = JSON.parse(userStr);
            if (currentUser.Role?.toLowerCase() === 'production') {
              const targetId = (currentUser.Employee_ID || '').toString().trim().toLowerCase();
              finalData = finalData.filter((item: any) => {
                const empId = (item.EmployeeID || item.Employee_ID || '').toString().trim().toLowerCase();
                return empId === targetId;
              });
            }
          } catch (e) {
            console.error('Error parsing user session', e);
          }
        }

        this.history = finalData;
        this.requests = finalData;
        this.divisions = Array.from(new Set(finalData.map(item => item.Division)));
        this.filteredRequests = [...this.requests]; // แสดงทั้งหมดตอนเริ่ม
        this.isLoading = false;
      },
      error: (e) => {
        console.error(e);
        this.isLoading = false;
      }
    });
  }

  onFilter() {
    if (!this.selectedDivision) {
      this.filteredRequests = [...this.requests]; // แสดงทั้งหมด
    } else {
      this.filteredRequests = this.requests.filter(
        item => item.Division === this.selectedDivision
      );
    }
  }
  onSort() {
    this.sortDesc = !this.sortDesc; // สลับโหมดการเรียง
    if (this.filteredRequests && this.filteredRequests.length > 0) {
      this.filteredRequests.sort((a, b) => {
        const timeA = new Date(a.Date_Record).getTime();
        const timeB = new Date(b.Date_Record).getTime();
        return this.sortDesc ? timeB - timeA : timeA - timeB;
      });
    }
  }


}
