import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';
import { HeartbeatService } from '../../core/services/heartbeat.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {

  // --- ตัวแปรสำหรับเก็บข้อมูลที่จะแสดงผลใน View (HTML) ---
  Employee_Name: any;             // เก็บชื่อพนักงานที่ Login เข้ามา
  imagePath = 'assets/images/1.png'; // Path รูปภาพโปรไฟล์เริ่มต้น
  cartCount: number = 0;          // ตัวนับจำนวนสินค้าในตะกร้า (Badge Notification)
  role: any;

  // --- Constructor: การ Inject Dependencies ---
  constructor(
    private router: Router,           // ใช้สำหรับเปลี่ยนหน้า (Navigation)
    private notificationService: NotificationService,
    private heartbeatService: HeartbeatService,
    @Inject(PLATFORM_ID) private platformId: Object // [SSR] ใช้ตรวจสอบว่ารันอยู่บน Browser หรือ Server
  ) { }

  // ทำงานทันทีเมื่อ Component ถูกโหลด
  // 1. ตรวจสอบ Environment ว่าเป็น Browser หรือไม่
  // 2. ดึงข้อมูล User จาก sessionStorage มาแสดง
  // 3. อัปเดตจำนวนสินค้าในตะกร้า
  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {

      // ดึงข้อมูล Key 'user' จาก Browser Storage
      const userData = sessionStorage.getItem('user');

      if (userData) {
        try {
          // แปลง String JSON กลับเป็น Object
          const user = JSON.parse(userData);
          // กำหนดชื่อที่จะแสดง ถ้าไม่มีให้ใช้ 'Guest'
          this.Employee_Name = user.Employee_Name || 'Guest';
          // *** เพิ่ม logic ดึงค่า Role ตรงนี้ ***
          // พยายามหาจาก user.role หรือ user.Role หรือหาจาก sessionStorage โดยตรง
          this.role = user.role || user.Role || sessionStorage.getItem('role');
          console.log('Current Role:', this.role);
        } catch (e) {
          // [Error Handling]: กรณีข้อมูล JSON เสียหาย
          console.error('Error parsing user data:', e);
          this.Employee_Name = 'Guest';
        }
      }

      // เรียกฟังก์ชันนับจำนวนสินค้าในตะกร้าทันทีที่โหลดหน้า
      this.updateCartCount();
    }
  }

  // Handle clicks on restricted menus (e.g., for PC role)
  handleRestrictedClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    Swal.fire({
      icon: 'error',
      title: 'Access Denied',
      text: 'You do not have permission to access this page.',
      confirmButtonColor: '#d33'
    });
  }


  // ฟังก์ชันสำหรับดึงข้อมูลตะกร้าจาก Storage มานับจำนวน
  updateCartCount() {
    if (isPlatformBrowser(this.platformId)) {
      const cartData = sessionStorage.getItem('cart');

      if (cartData) {
        try {
          const cartItems = JSON.parse(cartData);
          // นับจำนวนสินค้าจากความยาวของ Array
          this.cartCount = cartItems.length;
        } catch (e) {
          console.error('Invalid cart data:', e);
          this.cartCount = 0;
        }
      } else {
        // ถ้าไม่มีข้อมูลในตะกร้า ให้เซ็ตเป็น 0
        this.cartCount = 0;
      }
    }
  }



  // 1. แสดง Popup ถามยืนยัน (SweetAlert2)
  // 2. ถ้าผู้ใช้กด "Yes" -> ล้างข้อมูล Session -> เด้งไปหน้า Login
  logout() {
    Swal.fire({
      title: 'Are you sure?',           // หัวข้อ Popup
      text: 'คุณต้องการออกจากระบบหรือไม่?',  // ข้อความรายละเอียด
      icon: 'question',                 // ไอคอนรูปเครื่องหมายคำถาม
      showCancelButton: true,           // แสดงปุ่ม Cancel
      confirmButtonColor: '#d33',       // สีปุ่มยืนยัน (แดง)
      cancelButtonColor: '#3085d6',     // สีปุ่มยกเลิก (ฟ้า)
      confirmButtonText: 'Yes, log out', // ข้อความบนปุ่มยืนยัน
      cancelButtonText: 'Cancel'        // ข้อความบนปุ่มยกเลิก
    }).then((result) => {
      // ตรวจสอบว่าผู้ใช้กดปุ่ม "Yes" หรือไม่
      if (result.isConfirmed) {

        //  ตรวจสอบก่อนล้างข้อมูล
        if (isPlatformBrowser(this.platformId)) {
          // Trigger the HTTP logout first to release IsLoggedIn=0 in DB!
          this.heartbeatService.forceLogoutApi().subscribe({
            next: () => this.finalizeLogout(true),
            error: () => this.finalizeLogout(true)
          });
        } else {
          this.finalizeLogout(false);
        }
      }
    });
  }

  private finalizeLogout(isBrowser: boolean) {
    if (isBrowser) {
      if (this.role === 'admin' || sessionStorage.getItem('role') === 'admin') {
        localStorage.setItem('logout-event', Date.now().toString());
      }
      sessionStorage.clear();
      this.notificationService.logout();
      this.heartbeatService.stopHeartbeat();
      if (window.opener) {
        window.close();
      }
    }
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}