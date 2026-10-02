import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-print-action-btn',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './print-action-btn.component.html',
    styleUrls: ['./print-action-btn.component.scss']
})
export class PrintActionBtnComponent {
    @Input() dwgCount: number = 0;
    @Input() layoutCount: number = 0;
    @Input() iiqcCount: number = 0;

    @Output() onPrint = new EventEmitter<void>();

    constructor() { }

    onClick() {
        this.onPrint.emit();
    }
}
