import { Component, OnDestroy, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { SidebarPurchaseComponent } from "../../../components/sidebar/sidebarPurchase.component";
import { CommonModule, NgFor } from '@angular/common';
import { EmployeeService } from '../../../core/services/Employee.service';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { AuthService } from '../../../core/services/auth.service';
import Swal from 'sweetalert2';
import { Subscription, interval } from 'rxjs'; // For polling

declare var bootstrap: any;

@Component({
  selector: 'app-add-user',
  standalone: true,
  imports: [SidebarPurchaseComponent, CommonModule, NgFor, FormsModule, NgSelectModule],
  templateUrl: './add-user.component.html',
  styleUrl: './add-user.component.scss'
})
export class AddUserComponent implements OnInit, OnDestroy {
  userRole: string = 'view';
  // users: any[] = [];
  Employee: any[] = [];// ข้อมูลพนักงานทั้งหมด
  groupedEmployees: { [key: string]: any[] } = {}; // ข้อมูลพนักงานที่จัดกลุ่มตาม Role

  Role: any = [ // ตัวเลือก Role
    { label: 'Admin', value: 'admin' },
    { label: 'PC', value: 'PC' },
    { label: 'Production', value: 'production' },
    { label: 'Purchase', value: 'purchase' },
    { label: 'Engineer', value: 'engineer' },
    { label: 'QC', value: 'QC' },
    { label: 'Gague', value: 'Gague' },
    { label: 'Cost', value: 'Cost' },
    { label: 'View', value: 'view' }
  ];

  // รับค่าจากแบบฟอร์ม (เพิ่มใหม่)
  Role_: string | null = null;
  EmployeeId_: string = '';
  EmployeeName_: string = '';
  Username_: string = '';
  Password_: string = '';
  Email_: string = '';
  Subscription_: string = 'Unsubscribed';

  // ====== 🔸 STATE สำหรับแก้ไขแบบ inline ======
  editingId: string | null = null;   // รหัสพนักงานที่กำลังแก้
  editForm: any = {                  // ฟอร์มชั่วคราวตอนแก้
    Employee_ID: '',
    Employee_Name: '',
    Username: '',
    Password: '',
    Role: '',
    Email: '',
    Subscription: 'Unsubscribed'
  };

  SubscriptionOptions: any[] = [
    { label: 'Subscribed', value: 'Subscribed' },
    { label: 'Unsubscribed', value: 'Unsubscribed' }
  ];

  private refreshSubscription: Subscription = new Subscription();

  constructor(private EmployeeService: EmployeeService,
    private router: Router,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  isViewer(): boolean {
    return this.authService.isViewer();
  }


  ngOnInit() {
    this.Get_Employee();

    // Auto-refresh every 30 seconds to keep session alive and update data
    if (isPlatformBrowser(this.platformId)) {
      this.refreshSubscription = interval(30000).subscribe(() => {
        // Refresh silently (or check for unsaved edits if needed)
        // If user is editing, we might skip full reload or merge carefully.
        // For now, simple reload is better than session timeout.
        // But if user is editing, reload might wipe their edit state?
        // Let's check: Get_Employee updates `this.Employee` and `this.groupedEmployees`.
        // It DOES NOT clear `editingId` or `editForm`.
        // So if `editingId` matches an ID in the new list, the UI will still show edit mode.
        // However, if the row is removed, it might break. But risk is low.
        if (!this.editingId) {
          this.Get_Employee();
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }



  //  ดึงข้อมูลพนักงานและจัดกลุ่มตาม Role
  Get_Employee() {
    this.EmployeeService.get_Employee().subscribe({
      next: (response) => {
        this.Employee = (response || []).map((emp: any) => ({
          ...emp,
          Subscription: (emp.Subscription === 1 || emp.Subscription === true || emp.Subscription === 'Subscribed') ? 'Subscribed' : 'Unsubscribed'
        }));
        this.groupedEmployees = this.groupItemsByRole(this.Employee);
      },
      error: (e) => console.error(e),
    });
  }

  // เพิ่มพนักงาน
  addEmployee() {
    if (!this.EmployeeId_ || !this.EmployeeName_ || !this.Password_ || !this.Role_) {
      Swal.fire({ icon: 'warning', title: 'Please fill out the information completely' });
      return;
    }

    const employeeData = {
      Employee_ID: this.EmployeeId_,
      Employee_Name: this.EmployeeName_,
      Username: this.EmployeeId_, // Username = Employee ID
      Password: this.Password_,
      Role: this.Role_,
      Email: this.Email_,
      Subscription: this.Subscription_
    };

    this.EmployeeService.addEmployee(employeeData).subscribe({
      next: () => {
        Swal.fire({ icon: 'success', title: 'Complete', text: 'Data has been recorded successfully' });

        //  ปิด modal
        const modalEl = document.getElementById('Insert');
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.hide();

        this.resetForm();
        this.Get_Employee();
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err?.error?.error || 'Unable to save data'
        });
      }
    });
  }


  resetForm() {
    this.Role_ = null;
    this.EmployeeId_ = '';
    this.EmployeeName_ = '';
    this.Username_ = '';
    this.Password_ = '';
    this.Email_ = '';
    this.Subscription_ = 'Unsubscribed';
  }

  //  ลบพนักงาน
  deleteEmployee(empId: string) {
    Swal.fire({
      title: 'Do you want to delete this employee?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.EmployeeService.deleteEmployee(empId).subscribe({
          next: () => {
            Swal.fire('Delete Complete!', 'Employee Information has been Deleted', 'success');
            // อัปเดตหน้าโดยไม่ reload
            this.Employee = this.Employee.filter(e => e.Employee_ID !== empId);
            this.groupedEmployees = this.groupItemsByRole(this.Employee);
          },
          error: (err) => {
            console.error('Unable to delete data:', err);
            // Show the actual error message from backend
            Swal.fire('Error', err?.error?.error || 'Unable to delete data', 'error');
          }
        });
      }
    });
  }

  // ======  เริ่มแก้ไข ======
  startEdit(emp: any) {
    this.editingId = emp.Employee_ID;
    this.editForm = {
      Employee_ID: emp.Employee_ID,
      Employee_Name: emp.Employee_Name,
      Username: emp.Username,
      Password: emp.Password,
      Role: emp.Role,
      Email: emp.Email,
      Subscription: emp.Subscription || 'Unsubscribed'
    };
  }

  // ======  ยกเลิกแก้ไข ======
  cancelEdit() {
    this.editingId = null;
    this.editForm = {
      Employee_ID: '',
      Employee_Name: '',
      Username: '',
      Password: '',
      Role: '',
      Email: '',
      Subscription: 'Unsubscribed'
    };
  }

  // ======  บันทึกแก้ไข (อัปเดต backend + อัปเดตหน้า) ======
  saveEdit(originalEmp: any) {
    // validate ง่าย ๆ
    if (!this.editForm.Employee_Name || !this.editForm.Username || !this.editForm.Role || !this.editForm.Email) {
      Swal.fire({ icon: 'warning', title: 'Incomplete Information Filled', text: 'Please fill out the information completely' });
      return;
    }

    this.EmployeeService.updateEmployee(this.editForm).subscribe({
      next: () => {
        // Fetch the latest data from the database immediately to be 100% in sync
        this.Get_Employee();

        this.cancelEdit();
        Swal.fire({ icon: 'success', title: 'Save Complete', timer: 1200, showConfirmButton: false });
      },
      error: (err) => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error ' });
      }
    });
  }

  //  จัดกลุ่มพนักงานตาม Role ( แก้บั๊ก)
  groupItemsByRole(items: any[]): { [key: string]: any[] } {
    const grouped: { [key: string]: any[] } = {};
    items.forEach((item) => {
      const roleValue = item.Role || 'Not specified';
      const groupKey = String(roleValue); //  ใช้สตริงปกติ
      if (!grouped[groupKey]) grouped[groupKey] = [];
      grouped[groupKey].push(item);
    });
    // (ทางเลือก) เรียงภายในกลุ่มตามชื่อ
    Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => (a.Employee_Name || '').localeCompare(b.Employee_Name || '')));
    return grouped;
  }


  getRoleBadgeClass(role: string): string {
    const r = (role || '').toLowerCase();
    const map: { [key: string]: string } = {
      'admin': 'role-admin',
      'purchase': 'role-purchase',
      'production': 'role-production',
      'engineer': 'role-engineer',
      'pc': 'role-pc',
      'qc': 'role-qc',
      'gague': 'role-gague',
      'cost': 'role-cost',
      'view': 'role-view'
    };
    return map[r] || 'role-default';
  }

  // ======  trackBy ======
  trackByGroup(index: number, group: any): string {
    return group.key;
  }

  trackByEmp(index: number, emp: any): string {
    return emp.Employee_ID;
  }

}
