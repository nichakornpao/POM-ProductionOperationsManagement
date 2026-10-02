import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-edit-data-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './edit-data-modal.component.html',
    styleUrls: ['./edit-data-modal.component.scss']
})
export class EditDataModalComponent implements OnInit {
    @Input() data: any;
    @Output() save = new EventEmitter<any>();
    @Output() cancel = new EventEmitter<void>();

    editForm: any = {};

    ngOnInit() {
        // Clone data to avoid direct mutation
        this.editForm = JSON.parse(JSON.stringify(this.data || {}));

        // Format date for native <input type="date">
        if (this.editForm.date) {
            this.editForm.date = new Date(this.editForm.date).toISOString().split('T')[0];
        }
    }

    onSave() {
        this.save.emit(this.editForm);
    }

    onCancel() {
        this.cancel.emit();
    }
}
