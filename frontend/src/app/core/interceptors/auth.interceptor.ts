import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

import { isPlatformBrowser } from '@angular/common';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let headersConfig: any = {};

    if (isPlatformBrowser(this.platformId)) {
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      if (token) {
        headersConfig['Authorization'] = `Bearer ${token}`;
      }

      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          const username = user.Username || user.username || user.Employee_ID || user.Employee_Name || user.Name;
          if (username) {
            headersConfig['x-username'] = username;
          }
          const role = user.Role || user.role;
          if (role) {
            headersConfig['x-role'] = role;
          }
        } catch (e) {
          console.error('Error parsing user data in interceptor', e);
        }
      }

      // Inject SessionToken for all requests (Heartbeat reads this from x-session-token header)
      const sessionToken = sessionStorage.getItem('sessionToken');
      if (sessionToken) {
        headersConfig['x-session-token'] = sessionToken;
      }
    }

    // Tag auth-related endpoints so handleAuthError can skip premature wipes
    const isAuthEndpoint = req.url.includes('/auth/logout') || req.url.includes('/auth/heartbeat');

    if (Object.keys(headersConfig).length > 0) {
      const cloned = req.clone({
        setHeaders: headersConfig
      });
      return next.handle(cloned).pipe(
        catchError((error: HttpErrorResponse) => this.handleAuthError(error, isAuthEndpoint))
      );
    }
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => this.handleAuthError(error, isAuthEndpoint))
    );
  }

  private handleAuthError(error: HttpErrorResponse, isAuthEndpoint = false): Observable<never> {
    // IMPORTANT: Never wipe sessionStorage on logout/heartbeat endpoints.
    // The sidebar logout flow relies on the token surviving long enough for the
    // API call to fully resolve before finalizeLogout() clears local storage.
    if (!isAuthEndpoint && error.status === 403 && error.error?.message?.includes('Session Blocked')) {
      if (isPlatformBrowser(this.platformId)) {
        sessionStorage.clear();
      }
      this.router.navigate(['/login']);
    }
    return throwError(() => error);
  }
}
