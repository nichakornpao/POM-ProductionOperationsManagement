import { Injectable, OnDestroy, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { interval, Subject, Observable, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root'
})
export class HeartbeatService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private heartbeatActive = false;
  private currentEmployeeId: string | null = null;
  private hasTriggeredKickout = false;
  private readonly apiUrl = environment.apiUrl;

  // Public signal: components subscribe to this to show "Session Terminated" modal
  public sessionTerminated$ = new BehaviorSubject<boolean>(false);

  // Idle Guard Config
  private lastActivityTime = 0;
  private readonly IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 mins
  private activityListener = () => {
    const now = Date.now();
    // Throttle updates to avoid hammering the CPU on every single mouse drop
    if (now - this.lastActivityTime > 5000) {
      this.lastActivityTime = now;
    }
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.setupBeforeUnload();
    }
  }

  public forceLogoutApi(): Observable<any> {
    const empId = this.currentEmployeeId || (() => {
      try { 
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        return user?.Employee_ID || user?.employee_id || user?.id; 
      } catch(e) { return null; }
    })();
    if (empId) {
      return this.http.post(`${this.apiUrl}/auth/logout`, { Employee_ID: empId });
    }
    return new Observable(obs => { obs.next(null); obs.complete(); });
  }

  startHeartbeat(employeeId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.heartbeatActive) return;

    // Reset the kickout guard so that if the user re-logs in after being kicked,
    // they can still be kicked a second time (guard won't block it from the stale state).
    this.hasTriggeredKickout = false;

    this.currentEmployeeId = employeeId;
    this.heartbeatActive = true;

    this.setupActivityTracking();

    // Send the first ping immediately, then every 60 seconds (approved interval)
    this.sendPing();

    this.ngZone.runOutsideAngular(() => {
      interval(60000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          const elapsedIdle = Date.now() - this.lastActivityTime;
          if (elapsedIdle >= this.IDLE_TIMEOUT_MS) {
            this.ngZone.run(() => this.handleIdleTimeout());
          } else {
            this.sendPing();
          }
        });
    });
  }

  private setupActivityTracking(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.lastActivityTime = Date.now();
    this.ngZone.runOutsideAngular(() => {
      const opts = { capture: true, passive: true };
      window.addEventListener('mousemove', this.activityListener, opts);
      window.addEventListener('keydown', this.activityListener, opts);
      window.addEventListener('click', this.activityListener, opts);
      window.addEventListener('scroll', this.activityListener, opts);
    });
  }

  private stopActivityTracking(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const opts = { capture: true };
    window.removeEventListener('mousemove', this.activityListener, opts);
    window.removeEventListener('keydown', this.activityListener, opts);
    window.removeEventListener('click', this.activityListener, opts);
    window.removeEventListener('scroll', this.activityListener, opts);
  }

  private handleIdleTimeout(): void {
    console.warn('[Heartbeat] Idle timeout reached. Disconnecting session.');

    // Explicit server release before stopping internal state
    if (this.currentEmployeeId) {
      this.http.post(`${this.apiUrl}/auth/logout`, { Employee_ID: this.currentEmployeeId }).subscribe({
        complete: () => {
          this.triggerSessionTerminatedModal('หมดเวลาการใช้งาน', 'คุณไม่ได้ใช้งานระบบเป็นเวลานาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
        }
      });
    } else {
      this.triggerSessionTerminatedModal('หมดเวลาการใช้งาน', 'คุณไม่ได้ใช้งานระบบเป็นเวลานาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    }
  }

  // --- NEW: Centralized SweetAlert2 Modal for Session Termination ---
  public triggerSessionTerminatedModal(title: string = 'เซสชันสิ้นสุดลง', text: string = 'มีการเข้าสู่ระบบด้วยบัญชีนี้จากอุปกรณ์หรือเบราว์เซอร์อื่น\nหากคุณต้องการใช้งานต่อที่เครื่องนี้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง'): void {
    if (this.hasTriggeredKickout) return; // Guard against overlapping calls from Socket and Heartbeat
    this.hasTriggeredKickout = true;
    
    this.stopHeartbeat();
    
    const oldToken = sessionStorage.getItem('sessionToken');
    
    // 1. Instantly clear session and redirect for immediate security
    sessionStorage.clear();
    // Signal cross-tab sync so other tabs also go to login instantly.
    // We broadcast the specific token that was kicked out, so a newly logged-in tab (attacker) ignores this.
    if (oldToken) {
      localStorage.setItem('logout-event', oldToken);
    } else {
      localStorage.setItem('logout-event', Date.now().toString());
    }
    this.sessionTerminated$.next(true); // Signal any remaining components
    this.router.navigate(['/login'], { replaceUrl: true });
    
    // 2. Fire the SweetAlert2 modal — dark navy glassmorphism, matches login page theme
    Swal.fire({
      html: `
        <style>
          @keyframes swalIconRing {
            0%,100% { transform:scale(1);   opacity:0.4; }
            50%      { transform:scale(1.2); opacity:1;   }
          }
          .swal2-popup.swal-navy {
            border-radius: 1.75rem !important;
            padding: 2.75rem 2.25rem 2.25rem !important;
            background: #ffffff !important;
            box-shadow: 0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.06) !important;
            width: 460px !important;
            max-width: 94vw !important;
          }
          .swal2-html-container {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .swal-navy-ok {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
            border: none !important;
            border-radius: 1rem !important;
            font-family: 'Kanit', sans-serif !important;
            font-weight: 700 !important;
            font-size: 1rem !important;
            padding: 0.8rem 3rem !important;
            color: #fff !important;
            box-shadow: 0 4px 20px rgba(59,130,246,0.45),
                        inset 0 1px 0 rgba(255,255,255,0.15) !important;
            letter-spacing: 0.04em !important;
            transition: all 0.2s !important;
            cursor: pointer !important;
          }
          .swal-navy-ok:hover {
            background: linear-gradient(135deg, #60a5fa, #2563eb) !important;
            transform: translateY(-2px) !important;
            box-shadow: 0 8px 28px rgba(59,130,246,0.6),
                        inset 0 1px 0 rgba(255,255,255,0.15) !important;
          }
          .swal2-actions { margin-top: 1.75rem !important; }
        </style>
        <div style="font-family:'Kanit',sans-serif;text-align:center;position:relative;">


          <!-- Icon -->
          <div style="position:relative;width:80px;height:80px;margin:0 auto 1.4rem;">
            <div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid rgba(245,158,11,0.3);animation:swalIconRing 2.2s ease-in-out infinite;"></div>
            <div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid rgba(245,158,11,0.5);animation:swalIconRing 2.2s ease-in-out infinite 0.4s;"></div>
            <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(145deg,rgba(245,158,11,0.2),rgba(217,119,6,0.1));border:1.5px solid rgba(245,158,11,0.45);display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(245,158,11,0.25),inset 0 1px 0 rgba(255,255,255,0.1);">
              <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" fill="#f59e0b" viewBox="0 0 16 16" style="filter:drop-shadow(0 0 10px rgba(245,158,11,0.7))">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
              </svg>
            </div>
          </div>

          <!-- Badge -->
          <div style="display:inline-block;background:#fef3c7;border:1px solid #fcd34d;border-radius:2rem;padding:0.2rem 0.875rem;margin-bottom:0.9rem;">
            <span style="color:#d97706;font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Session Expired</span>
          </div>

          <!-- Title -->
          <div style="font-size:1.45rem;font-weight:800;color:#0f172a;margin-bottom:0.5rem;line-height:1.3;">${title}</div>

          <!-- Divider -->
          <div style="height:1px;background:#f1f5f9;margin:0.9rem 0 1rem;"></div>

          <!-- Body -->
          <div style="color:#475569;font-size:0.93rem;line-height:1.8;">${text.replace(/\n/g, '<br>')}</div>
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: 'ตกลง รับทราบ',
      allowOutsideClick: false,
      allowEscapeKey: false,
      background: '#ffffff',
      backdrop: 'radial-gradient(ellipse at center,rgba(30,58,138,0.92) 0%,rgba(0,4,40,0.96) 50%,rgba(0,0,0,0.98) 100%)',
      customClass: {
        popup: 'swal-navy',
        confirmButton: 'swal-navy-ok',
      },
    }).then(() => {
      this.hasTriggeredKickout = false;
    });
  }



  stopHeartbeat(): void {
    this.heartbeatActive = false;
    this.currentEmployeeId = null;
    this.hasTriggeredKickout = false; // reset state
    this.stopActivityTracking();
    this.destroy$.next();
  }

  private sendPing(): void {
    if (!this.currentEmployeeId) return;
    // NOTE: x-session-token is automatically injected by the AuthInterceptor via interceptor header.
    // The body carries Employee_ID; the token rides in the header for architectural consistency.
    this.http.post(`${this.apiUrl}/auth/heartbeat`, { Employee_ID: this.currentEmployeeId }, { responseType: 'text' })
      .subscribe({
        next: () => { /* Heartbeat OK */ },
        error: (err) => {
          if (err.status === 409) {
            // Changed validation from 'err.error?.status' since backend might just send JSON with message
            // or we just trust any 409 from the heartbeat endpoint means termination
            this.ngZone.run(() => {
              console.warn('[Heartbeat] Session terminated by a competing login.');
              this.triggerSessionTerminatedModal();
            });
          } else {
            console.error('Heartbeat ping failed:', err);
          }
        }
      });
  }

  private setupBeforeUnload(): void {
    window.addEventListener('beforeunload', () => {
      this.releaseLockBeacon();
    });
  }

  public releaseLockBeacon(): void {
    if (!this.currentEmployeeId) {
      try {
        const userStr = sessionStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          this.currentEmployeeId = user.Employee_ID || user.employee_id || user.id;
        }
      } catch (e) {}
    }

    if (this.currentEmployeeId) {
      const url = `${this.apiUrl}/auth/logout`;
      // Use Blob to mimic a JSON POST request
      const body = new Blob([JSON.stringify({ Employee_ID: this.currentEmployeeId })], { type: 'application/json' });
      navigator.sendBeacon(url, body);
    }
  }

  ngOnDestroy(): void {
    this.releaseLockBeacon();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
