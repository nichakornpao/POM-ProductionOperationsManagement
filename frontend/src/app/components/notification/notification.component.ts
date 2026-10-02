import { CommonModule } from '@angular/common';
import { Component, OnInit, ElementRef, HostListener } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NotificationService, NotificationLog } from '../../core/services/notification.service';
import { Observable } from 'rxjs';
import { NotificationInboxComponent } from './notification-inbox/notification-inbox.component';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationInboxComponent],
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.scss']
})
export class NotificationComponent implements OnInit {
  isOpen = false;
  isInboxOpen = false; // State for Gmail-style Inbox
  selectedNotification: NotificationLog | null = null; // State for Popup
  unreadCount$: Observable<number>;
  notifications$: Observable<NotificationLog[]>;

  constructor(
    private notificationService: NotificationService,
    private elementRef: ElementRef
  ) {
    this.unreadCount$ = this.notificationService.unreadCount$;
    this.notifications$ = this.notificationService.notifications$;
  }

  ngOnInit(): void { }

  togglePanel() {
    // Instead of the old dropdown, we open the new Inbox Modal
    this.isInboxOpen = !this.isInboxOpen;

    // Fetch fresh data whenever the inbox is opened
    if (this.isInboxOpen) {
      this.notificationService.fetchNotifications();
    }
  }

  closeInbox() {
    this.isInboxOpen = false;
  }

  markAllRead() {
    this.notificationService.markAllRead();
  }

  openDetail(item: NotificationLog) {
    this.selectedNotification = item;

    // Auto mark as read when opened
    if (!item.IsRead && item.Notification_ID) {
      this.notificationService.markAsRead(item.Notification_ID);
    }
  }

  closeDetail() {
    this.selectedNotification = null;
  }

  // Close when clicking outside
  @HostListener('document:click', ['$event'])
  clickout(event: any) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }
}
