import { Component } from '@angular/core';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component ({
    selector: 'app-dropdown-search',
    standalone: true,
    imports:[CommonModule, FormsModule, NgSelectModule],
    templateUrl: './dropdown-search.component.html',
    styleUrl: './dropdown-search.component.scss'
})

export class DropdownSearchComponent {
    case = [
        {id: 1,name:'Caseone'},
        {id: 2,name:'Casetwo'},
        {id: 3,name:'Casethree'},
        {id: 4,name:'Casefour'}
    ];
    selectedCase: number | null=null ;
}
