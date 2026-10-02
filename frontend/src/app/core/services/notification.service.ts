import { Injectable, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, Subject, tap } from 'rxjs';

import { HeartbeatService } from './heartbeat.service';

import { environment } from '../../../environments/environment';
import { NOTIFICATION_TEMPLATES, getTemplate } from '../utils/notification-templates';

export interface NotificationLog {
  Notification_ID?: number;
  Event_Type: string;
  Subject?: string;
  Message: string;
  Message_TH?: string;
  Doc_No?: string;
  Action_By?: string;
  Target_Roles?: string;
  CTA_Route?: string;
  Details_JSON?: any;         // NEW: Dynamic payload (parsed JSON)
  Created_At: Date;
  IsRead: boolean;
  Division_Id?: number;     // NEW: For numeric tab filtering (2=PMC, 3=GM)
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private socket!: Socket;

  // State Management
  private notificationsSubject = new BehaviorSubject<NotificationLog[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(true);
  public isLoading$ = this.isLoadingSubject.asObservable();

  // Trash State
  private trashSubject = new BehaviorSubject<NotificationLog[]>([]);
  public trash$ = this.trashSubject.asObservable();

  // Forecast DB Autoload State
  private forecastAutoloadSubject = new Subject<any>();
  public forecastAutoload$ = this.forecastAutoloadSubject.asObservable();

  private currentUserRole: string = '';
  private currentUserName: string = '';  // Employee_ID or Name โ€” used to suppress self-notifications
  private currentEmployeeId: string | null = null;  // ID_Employee string โ€” for per-user state SP calls

  // User Preferences
  public mutedDivision: number | null = null; // 2=PMC, 3=GM

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private http: HttpClient,
    private zone: NgZone,
    private heartbeatService: HeartbeatService
  ) {
    // Connect to Backend Socket.IO only in Browser
    if (isPlatformBrowser(this.platformId)) {
      // Read role and username from sessionStorage
      try {
        const userSession = sessionStorage.getItem('user');
        if (userSession) {
          const user = JSON.parse(userSession);
          this.currentUserRole = (user.Role || user.role || '').toLowerCase().trim();
          this.currentUserName = (user.Username || user.username || user.Employee_ID || user.Employee_Name || user.Name || '').toLowerCase().trim();
          const rawEmpId = user.Employee_ID || user.employee_id || user.ID_Employee;
          this.currentEmployeeId = rawEmpId ? String(rawEmpId) : null;
        }
      } catch (e) {
        console.error('Error reading user session for notifications:', e);
      }

      // Ensure initialization logic only proceeds if a known user exists
      if (this.currentUserName) {
        this.loadPreferences();
        this.initializeConnection();
      } else {
        this.notificationsSubject.next([]);
        this.isLoadingSubject.next(false);
      }
    }
  }

  private hasInitializedConnection = false;

  private initializeConnection() {
    if (this.hasInitializedConnection) {
      this.fetchNotifications();
      return;
    }
    this.hasInitializedConnection = true;

    // Wrap socket connection outside Angular to prevent Hydration Timeout (NG0506)
    this.zone.runOutsideAngular(() => {
      this.socket = io(environment.socketUrl, {
        transports: ['polling', 'websocket'], // Start with polling for stability
        reconnection: true,
        reconnectionAttempts: 5,        // max 5 retries
        reconnectionDelay: 3000,        // start at 3s
        reconnectionDelayMax: 30000,    // cap at 30s
        randomizationFactor: 0.5,       // jitter to prevent thundering herd
        timeout: 10000,                 // 10s connection timeout
      });
      this.setupSocketListeners();
    });

    this.fetchNotifications();
  }

  // Reloads notifications and role config on successful SPA login
  public refreshSession() {
    if (isPlatformBrowser(this.platformId)) {
      // Clear old state immediately so user doesn't see old notifications during loading
      this.notificationsSubject.next([]);
      this.unreadCountSubject.next(0);
      this.isLoadingSubject.next(true);

      try {
        const userSession = sessionStorage.getItem('user');
        if (userSession) {
          const user = JSON.parse(userSession);
          this.currentUserRole = (user.Role || user.role || '').toLowerCase().trim();
          this.currentUserName = (user.Username || user.username || user.Employee_ID || user.Employee_Name || user.Name || '').toLowerCase().trim();
          const rawEmpId2 = user.Employee_ID || user.employee_id || user.ID_Employee;
          this.currentEmployeeId = rawEmpId2 ? String(rawEmpId2) : null;
        }
      } catch (e) {
        console.error('Error reading user role for notifications:', e);
      }

      if (this.currentUserName) {
        this.loadPreferences();
        this.initializeConnection();
      } else {
        this.notificationsSubject.next([]);
        this.isLoadingSubject.next(false);
      }
    }
  }

  public logout() {
    this.notificationsSubject.next([]);
    this.unreadCountSubject.next(0);
    this.trashSubject.next([]);
    this.isLoadingSubject.next(false);
    this.currentUserRole = '';
    this.currentUserName = '';
    this.currentEmployeeId = null;
    this.mutedDivision = null;
    this.hasInitializedConnection = false;
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // --- User Preferences ---
  private loadPreferences() {
    if (this.currentEmployeeId && isPlatformBrowser(this.platformId)) {
      const storedMute = localStorage.getItem(`notification_mute_${this.currentEmployeeId}`);
      this.mutedDivision = storedMute ? parseInt(storedMute, 10) : null;
    }
  }

  public setMutedDivision(divisionId: number | null) {
    this.mutedDivision = divisionId;
    if (this.currentEmployeeId && isPlatformBrowser(this.platformId)) {
      if (divisionId !== null) {
        localStorage.setItem(`notification_mute_${this.currentEmployeeId}`, divisionId.toString());
      } else {
        localStorage.removeItem(`notification_mute_${this.currentEmployeeId}`);
      }
    }
    // Instantly recount unread notifications for main Navbar
    this.updateUnreadCount();
  }

  /** Build HTTP headers that identify the current user for per-user state SPs */
  private getAuthHeaders(): HttpHeaders {
    // Lazy-reload: if username was empty at constructor time (SSR/race condition), retry from sessionStorage
    if (!this.currentUserName && isPlatformBrowser(this.platformId)) {
      try {
        const userSession = sessionStorage.getItem('user');
        if (userSession) {
          const user = JSON.parse(userSession);
          // BUG FIX: Removed .toLowerCase() to preserve SQL case-sensitivity
          // and prevent silent database insertion mismatch during READ actions
          this.currentUserName = (user.Username || user.username || user.Employee_ID || user.Employee_Name || user.Name || '').trim();
          this.currentUserRole = (user.Role || user.role || '').toLowerCase().trim();
        }
      } catch (e) { /* ignore */ }
    }

    let headers = new HttpHeaders();
    if (this.currentUserName) {
      headers = headers.set('x-username', this.currentUserName);
    }
    if (this.currentUserRole) {
      headers = headers.set('x-role', this.currentUserRole);
    }
    return headers;
  }

  // Fetch initial history from DB (with role filtering)
  public fetchNotifications() {
    this.isLoadingSubject.next(true);

    // Explicit Cache-Busting: Append a precise timestamp to force the browser to skip the HTTP cache
    const ts = new Date().getTime();
    const roleParam = this.currentUserRole ? `?role=${this.currentUserRole}&t=${ts}` : `?t=${ts}`;
    this.http.get<NotificationLog[]>(`${environment.apiUrl}/notifications/list${roleParam}`, { headers: this.getAuthHeaders() })
      .subscribe({
        next: (data) => {
          // ── Self-exclusion: filter out notifications triggered by the current user ──
          // The server stores Exclude_Username in the payload but also sends all matching
          // role-based notifications. This client-side filter is the enforcement point.
          const filtered = this.currentUserName
            ? data.filter(n => {
              const sender = (n.Action_By || '').toLowerCase().trim();
              return sender !== this.currentUserName;
            })
            : data;

          this.notificationsSubject.next(filtered);
          this.updateUnreadCount();
          this.isLoadingSubject.next(false);
        },
        error: (err) => {
          console.error('Failed to fetch notifications:', err);
          this.isLoadingSubject.next(false);
        }
      });
  }

  // Fetch trash from DB
  public fetchTrash() {
    const roleParam = this.currentUserRole ? `?role=${this.currentUserRole}` : '';
    this.http.get<NotificationLog[]>(`${environment.apiUrl}/notifications/trash${roleParam}`, { headers: this.getAuthHeaders() })
      .subscribe({
        next: (data) => this.trashSubject.next(data),
        error: (err) => console.error('Failed to fetch trash:', err)
      });
  }

  // Soft-delete all read notifications -> move to trash
  public deleteRead(): Observable<any> {
    return this.http.put(`${environment.apiUrl}/notifications/delete-read`, {}, { headers: this.getAuthHeaders() }).pipe(
      tap(() => {
        const remaining = this.notificationsSubject.value.filter(n => !n.IsRead);
        this.notificationsSubject.next(remaining);
        this.updateUnreadCount();
        this.fetchTrash();
      })
    );
  }

  // Soft-delete specific notification IDs -> move to trash
  public deleteByIds(ids: number[]): Observable<any> {
    return this.http.put(`${environment.apiUrl}/notifications/delete-by-ids`, { ids }, { headers: this.getAuthHeaders() }).pipe(
      tap(() => {
        const idSet = new Set(ids);
        const remaining = this.notificationsSubject.value.filter(n => !idSet.has(n.Notification_ID!));
        this.notificationsSubject.next(remaining);
        this.updateUnreadCount();
        this.fetchTrash();
      })
    );
  }

  // Restore a single notification from trash back to inbox
  public restoreFromTrash(id: number): Observable<any> {
    return this.http.put(`${environment.apiUrl}/notifications/restore/${id}`, {}, { headers: this.getAuthHeaders() }).pipe(
      tap(() => {
        const updated = this.trashSubject.value.filter(n => n.Notification_ID !== id);
        this.trashSubject.next(updated);
        this.fetchNotifications();
      })
    );
  }

  // Allow components to manually add notifications (Fallback/Local feedback)
  public addManualNotification(message: string, type: string = 'INFO') {
    const tmpl = getTemplate(type);
    const newNotif: NotificationLog = {
      Event_Type: type,
      Subject: tmpl?.subject || type,
      Message: message,
      Message_TH: '',
      Created_At: new Date(),
      IsRead: false
    };
    this.addNotification(newNotif);
    this.playNotificationSound();
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to Notification Server:', this.socket.id);
    });

    // --- FORECAST DB AUTOLOAD LISTENER ---
    this.socket.on('forecast:autoload-updated', (data: any) => {
      this.zone.run(() => {
        console.log('[Autoload] Socket forecast:autoload-updated received:', data);
        this.forecastAutoloadSubject.next(data);
      });
    });

    // --- INSTANT KICK-OUT LISTENER ---
    // Listens for a forced login from the backend and immediately terminates the old session
    this.socket.on('forceLogout', (data: any) => {
      this.zone.run(() => {
        const currentEmpId = this.currentEmployeeId ? String(this.currentEmployeeId) : '';
        const targetEmpId = data.Employee_ID ? String(data.Employee_ID) : '';

        if (currentEmpId && currentEmpId === targetEmpId) {
          const currentToken = sessionStorage.getItem('sessionToken');
          if (currentToken && currentToken !== data.newSessionToken) {
            console.warn('[Realtime] Kicked out! A new session took over.');
            this.heartbeatService.triggerSessionTerminatedModal();
          }
        }
      });
    });

    this.socket.on('notification', (data: any) => {
      this.zone.run(() => {
        console.log('New Notification Received:', data);

        // ── 1. Self-exclusion: suppress notifications triggered by the current user ──
        if (data.excludeUsername) {
          const excludedId = String(data.excludeUsername).toLowerCase().trim();
          const currentIdStr = this.currentEmployeeId ? String(this.currentEmployeeId).toLowerCase() : '';
          const currentNameStr = this.currentUserName ? this.currentUserName.toLowerCase().trim() : '';

          if (excludedId === currentIdStr || excludedId === currentNameStr) {
            console.log('[Notification] Suppressed: excludeUsername matched current user');
            return;
          }
        } else if (this.currentUserName && data.actionBy) {
          const senderName = (data.actionBy as string).toLowerCase().trim();
          if (senderName === this.currentUserName) {
            console.log('[Notification] Suppressed: triggered by self (' + senderName + ')');
            return;
          }
        }

        // ── 2. Role/User-based filtering on the client side ──
        const targetRef = (data.targetRoles || 'ALL').toLowerCase();
        if (targetRef !== 'all') {
          const refsArray = targetRef.split(',').map((r: string) => r.trim().toLowerCase());
          const role = this.currentUserRole.toLowerCase();
          const username = this.currentUserName.toLowerCase();

          // Helper for alias matching (mirrors backend resolveRoles logic)
          const isRoleMatch = (r: string) => {
            if (role === r) return true;
            // Alias matches
            if (role === 'ph' && r === 'purchase') return true;
            if (role === 'purchase' && r === 'ph') return true;
            if (role === 'pd' && r === 'production') return true;
            if (role === 'production' && r === 'pd') return true;

            const engAliases = ['engineer', 'eng', 'en'];
            if (engAliases.includes(role) && engAliases.includes(r)) return true;

            const pcAliases = ['pc', 'planner', 'production control'];
            if (pcAliases.includes(role) && pcAliases.includes(r)) return true;

            const gaugeAliases = ['gauge', 'gague'];
            if (gaugeAliases.includes(role) && gaugeAliases.includes(r)) return true;

            const qcAliases = ['qc', 'quality', 'quality control'];
            if (qcAliases.includes(role) && qcAliases.includes(r)) return true;

            return false;
          };

          const isForRole = refsArray.some((r: string) => isRoleMatch(r));
          const isForUser = username && refsArray.includes(username);
          const isAdmin = role === 'admin';

          if (!isForRole && !isForUser && !isAdmin) {
            console.log('[Notification] Socket Filtered out: not for user/role', { user: username, role: role, target: targetRef });
            return;
          }
        }

        // Build Details_JSON — ensure Division is always injected from the
        // top-level socket field so getNotificationDivision() can resolve it.
        let socketDetails = data.detailsJson || {};
        if (typeof socketDetails === 'string') {
          try { socketDetails = JSON.parse(socketDetails); } catch { socketDetails = {}; }
        }
        if (data.division && !socketDetails.Division) {
          socketDetails.Division = data.division;
        }

        const newNotif: NotificationLog = {
          Notification_ID: data.id,
          Event_Type: data.type,
          Subject: data.subject || '',
          Message: data.message,
          Message_TH: data.messageTH || '',
          Doc_No: data.docNo,
          Action_By: data.actionBy || '',
          Target_Roles: data.targetRoles || 'ALL',
          CTA_Route: data.ctaRoute || '',
          Details_JSON: Object.keys(socketDetails).length > 0 ? socketDetails : null,
          Created_At: new Date(data.timestamp || new Date()),
          IsRead: false,
          Division_Id: data.divisionId
        };

        this.addNotification(newNotif);

        // Only play sound if the notification is NOT from the currently muted division
        if (newNotif.Division_Id !== this.mutedDivision) {
          this.playNotificationSound();
        }
      });
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Notification Server');
    });
  }

  private addNotification(notification: NotificationLog) {
    const current = this.notificationsSubject.value;
    const existingIndex = current.findIndex(n => n.Notification_ID === notification.Notification_ID);

    let updated;
    if (existingIndex > -1) {
      // UPSERT: Update existing notification in place but PRESERVE local IsRead state.
      // A socket re-emit always carries IsRead: false (it doesn't know local state).
      // Without this guard, every re-connect would reset all optimistically-read items.
      const existingIsRead = current[existingIndex].IsRead;
      updated = [...current];
      updated[existingIndex] = { ...notification, IsRead: existingIsRead || notification.IsRead };
    } else {
      // NEW: Add to top, keep max 50
      updated = [notification, ...current].slice(0, 50);
    }

    this.notificationsSubject.next(updated);
    this.updateUnreadCount();
  }

  private updateUnreadCount() {
    // TotalUnread - MutedUnread = DisplayedCount
    const count = this.notificationsSubject.value.filter(n =>
      !n.IsRead && n.Division_Id !== this.mutedDivision
    ).length;
    this.unreadCountSubject.next(count);
  }

  public markAsRead(id: number) {
    // Optimistic Update
    const current = this.notificationsSubject.value.map(n =>
      n.Notification_ID === id ? { ...n, IsRead: true } : n
    );
    this.notificationsSubject.next(current);
    this.updateUnreadCount();

    // API Call
    this.http.put(`${environment.apiUrl}/notifications/read/${id}`, {}, { headers: this.getAuthHeaders() }).subscribe({
      error: (err) => console.error('Failed to mark as read:', err)
    });
  }

  // Cross-reference mark as read (triggered from external components like tables)
  public markAsReadByDocNos(docNos: (string | null | undefined)[]) {
    const validDocs = docNos.filter(d => Boolean(d)).map(d => String(d));
    if (validDocs.length === 0) return;

    const current = this.notificationsSubject.value;
    const matchingAdvanced = current.filter(n => {
      if (n.IsRead) return false;
      if (n.Doc_No && validDocs.includes(String(n.Doc_No))) return true;
      // Try Details_JSON
      try {
        let d = typeof n.Details_JSON === 'string' ? JSON.parse(n.Details_JSON) : n.Details_JSON;
        if (d) {
          if (d.uniqueId && validDocs.includes(String(d.uniqueId))) return true;
          if (d.groupId && validDocs.includes(String(d.groupId))) return true;
          if (d.publicId && validDocs.includes(String(d.publicId))) return true;
        }
      } catch (e) { }
      return false;
    });

    matchingAdvanced.forEach(m => {
      if (m.Notification_ID) {
        this.markAsRead(m.Notification_ID);
      }
    });
  }

  // Mark all (Persistent)
  public markAllRead() {
    // Optimistic Update
    const current = this.notificationsSubject.value.map(n => ({ ...n, IsRead: true }));
    this.notificationsSubject.next(current);
    this.updateUnreadCount();

    // API Call
    this.http.put(`${environment.apiUrl}/notifications/mark-all-read`, {}, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => console.log('All notifications marked as read in DB'),
      error: (err) => console.error('Failed to mark all as read:', err)
    });
  }

  public getUnreadCount(): Observable<number> {
    return this.unreadCount$;
  }

  /**
   * Resolver: Fetch rich details (items, changes) on-demand when a notification is expanded.
   * Part of the "Pointer" architecture to avoid JSON bloat in the database.
   */
  public getNotificationDetails(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/notifications/${id}/details`, { headers: this.getAuthHeaders() });
  }

  /**
   * Plays a clean 2-note ascending chime (C5 โ€” E5) using Web Audio API.
   * Inspired by Line notification โ€” soft, clear, and distinctive.
   */
  private playNotificationSound() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

      const playTone = (frequency: number, startTime: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);

        // Soft attack + exponential fade-out
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(523.25, now, 0.25);        // C5 โ€” first note
      playTone(659.25, now + 0.15, 0.35); // E5 โ€” second note (slightly overlapping)

    } catch (error) {
      console.error('Notification sound error:', error);
    }
  }
}
