import { Component, Inject, PLATFORM_ID, OnInit, OnDestroy, NgZone } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { DropdownSearchComponent } from './components/dropdown-search/dropdown-search.component';
import { SidebarPurchaseComponent } from './components/sidebar/sidebarPurchase.component';
import { NotificationComponent } from './components/notification/notification.component';
import { filter } from 'rxjs/operators';
import { HeartbeatService } from './core/services/heartbeat.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, SidebarComponent, DropdownSearchComponent, SidebarPurchaseComponent, NotificationComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Frontend';
  showNotification = true;
  isLoginPage = true;
  isProductionRoute = false;
  isPurchaseRoute = false;

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
    private heartbeatService: HeartbeatService,
    private ngZone: NgZone
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      const url = event.urlAfterRedirects || event.url;

      this.isLoginPage = url.includes('/login') || url === '/';
      this.isProductionRoute = url.includes('/production');
      this.isPurchaseRoute = url.includes('/purchase');

      this.showNotification = !this.isLoginPage && !url.toLowerCase().includes('forecast');

      if (!this.isLoginPage && isPlatformBrowser(this.platformId)) {
        const userStr = sessionStorage.getItem('user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            if (user && user.Employee_ID) {
              this.heartbeatService.startHeartbeat(user.Employee_ID);
            }
          } catch (e) { }
        }
      }
    });

    // --- Cross-Tab Logout Synchronization ---
    // Listens for logout events triggered in other tabs (manual logout or force-kick).
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('storage', (event) => {
        if (event.key === 'logout-event') {
          const currentToken = sessionStorage.getItem('sessionToken');
          const broadcastedValue = event.newValue;

          // ── SAFETY GUARD ────────────────────────────────────────────────────────
          // If this tab is already on the login page (e.g., the attacker tab is in the
          // middle of a force-login flow), ignore the broadcast entirely.
          // Reason: when the victim tab broadcasts its old sessionToken upon being kicked,
          // the attacker tab may not yet have stored its NEW sessionToken in sessionStorage
          // (HTTP response hasn't resolved yet), making currentToken = null and triggering
          // a false-positive logout that wipes the new session before it's stored.
          if (this.isLoginPage) return;

          // A numeric value (Date.now() timestamp) means manual Sign Out → always honor it for all tabs.
          const isTimestampBroadcast = broadcastedValue !== null && !isNaN(Number(broadcastedValue));

          // A non-numeric value means a specific session token was force-kicked.
          // ONLY honor it if the token matches THIS tab's current sessionToken.
          // This prevents the newly logged-in attacker tab from killing its OWN fresh session.
          const isMyTokenKicked = !isTimestampBroadcast && broadcastedValue === currentToken;

          if (isTimestampBroadcast || isMyTokenKicked) {
            // Wrap in NgZone.run() — native storage events fire outside Angular's zone.
            // Without this, router.navigate() silently changes the URL but Angular
            // change detection never fires, so the view stays frozen.
            this.ngZone.run(() => {
              sessionStorage.clear();
              this.heartbeatService.stopHeartbeat();

              // Try to close the tab if it's a secondary popup
              if (window.opener) {
                window.close();
              }

              // Redirect to login if not already there (and window didn't close)
              if (!this.isLoginPage) {
                this.router.navigate(['/login'], { replaceUrl: true });
              }
            });
          }
        }
      });
    }
  }

  ngOnInit(): void {
    // HeartbeatService handles the SweetAlert2 modal directly; nothing needed here.
  }

  ngOnDestroy(): void {
  }
}
