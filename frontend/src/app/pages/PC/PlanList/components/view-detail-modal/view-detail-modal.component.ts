import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-view-detail-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './view-detail-modal.component.html',
    styleUrls: ['./view-detail-modal.component.scss']
})
export class ViewDetailModalComponent {
    @Input() data: any;
    @Output() close = new EventEmitter<void>();

    onClose() {
        this.close.emit();
    }
}
