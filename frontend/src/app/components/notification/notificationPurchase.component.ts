import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NotificationService, NotificationLog } from '../../core/services/notification.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-notificationpurchase',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './notificationPurchase.component.html',
  styleUrls: ['./notification.component.scss']
})
export class NotificationPurchaseComponent implements OnInit {
  isOpen = false;
  notifications$: Observable<NotificationLog[]>;

  constructor(private notificationService: NotificationService) {
    this.notifications$ = this.notificationService.notifications$;
  }

  ngOnInit() {
  }

  toggleNotification() {
    this.isOpen = !this.isOpen;
  }
}
