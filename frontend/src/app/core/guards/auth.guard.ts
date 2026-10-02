import { Injectable, Inject, PLATFORM_ID } from '@angular/core'; // **เพิ่ม 2 Imports**
import { isPlatformBrowser } from '@angular/common'; // **เพิ่ม 1 Import**
import { CanActivate, CanActivateChild, ActivatedRouteSnapshot, Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate, CanActivateChild {

  // **แก้ไข constructor เพื่อ Inject PLATFORM_ID**
  constructor(private router: Router, @Inject(PLATFORM_ID) private platformId: Object) { }

  canActivate(route: ActivatedRouteSnapshot): boolean {
    return this.checkRole(route);
  }

  canActivateChild(route: ActivatedRouteSnapshot): boolean {
    return this.checkRole(route);
  }

  private checkRole(route: ActivatedRouteSnapshot): boolean {

    // **เพิ่มการตรวจสอบสภาพแวดล้อม**
    if (!isPlatformBrowser(this.platformId)) {
      // ถ้ารันบนเซิร์ฟเวอร์ (SSR) ให้ข้ามการตรวจสอบ sessionStorage ชั่วคราว 
      // และอนุญาตให้ไปต่อได้ เพื่อให้การโหลดหน้าแรกไม่ล้มเหลว
      return true;
    }

    // ส่วนนี้จะถูกรันเฉพาะเมื่อโค้ดอยู่บน Browser เท่านั้น
    const token = sessionStorage.getItem('token');
    const userRole = sessionStorage.getItem('role'); //userRole 'view', 'production', etc. 

    if (!token) {
      this.router.navigate(['/login']);
      return false;
    }

    // ดึง roles ของ child route ก่อน parent
    const allowedRoles = route.data['roles'] || route.parent?.data['roles'];

    if (allowedRoles && !allowedRoles.includes(userRole!)) {
      console.warn('Access denied for role:', userRole, 'Allowed:', allowedRoles);
      // this.router.navigate(['/login']); // หรือเปลี่ยนเป็น 403
      return false;
    }


    return true;
  }
}
