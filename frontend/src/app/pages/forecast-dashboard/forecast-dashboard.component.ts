// @ts-nocheck
import { Component, ViewEncapsulation, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import { GridReadyEvent, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import Swal from 'sweetalert2';
import { MasterPHService } from '../../core/services/MasterPH.service';
import { ForecastService } from '../../core/services/forecast.service';
import { NotificationService } from '../../core/services/notification.service';
import * as XLSX from 'xlsx';

// Register all community features
ModuleRegistry.registerModules([AllCommunityModule]);

class CustomHeaderCheckbox {
  agParams: any;
  eGui!: HTMLDivElement;
  cb!: HTMLInputElement;
  selectionListener!: () => void;

  init(agParams: any) {
    this.agParams = agParams;
    this.eGui = document.createElement('div');
    this.eGui.className = 'd-flex align-items-center justify-content-center h-100 w-100';
    const label = document.createElement('label');
    label.className = 'ui-cb-container';

    this.cb = document.createElement('input');
    this.cb.type = 'checkbox';
    const checkmark = document.createElement('div');
    checkmark.className = 'ui-checkmark';
    label.appendChild(this.cb);
    label.appendChild(checkmark);
    this.eGui.appendChild(label);

    this.cb.addEventListener('change', (e) => {
      if (this.cb.checked) {
        this.agParams.api.selectAllFiltered();
      } else {
        this.agParams.api.deselectAllFiltered();
      }
    });

    this.selectionListener = () => {
      const allCount = this.agParams.api.getDisplayedRowCount();
      const selectedCount = this.agParams.api.getSelectedNodes().length;
      if (selectedCount > 0 && selectedCount === allCount && allCount !== 0) {
        this.cb.checked = true;
      } else {
        this.cb.checked = false;
      }
    };
    this.agParams.api.addEventListener('selectionChanged', this.selectionListener);
  }

  getGui() { return this.eGui; }
  destroy() {
    if (this.selectionListener) {
      this.agParams.api.removeEventListener('selectionChanged', this.selectionListener);
    }
  }
}

class CustomExpandableHeader {
  agParams: any;
  eGui!: HTMLDivElement;

  init(agParams: any) {
    this.agParams = agParams;
    this.eGui = document.createElement('div');
    this.eGui.className = 'd-flex align-items-center justify-content-end w-100 h-100 pe-1';

    const title = document.createElement('span');
    title.className = 'ag-header-cell-text';
    title.innerHTML = agParams.displayName;

    const btn = document.createElement('span');
    btn.className = 'badge bg-light text-secondary border p-1 ms-2 d-inline-flex align-items-center justify-content-center shadow-xs';
    btn.style.cursor = 'pointer';
    btn.style.lineHeight = '1';
    btn.style.transition = 'all 0.15s ease-in-out';
    btn.title = agParams.isExpanded() ? 'Hide Breakdown Rates (Achieve Rate & Broken Rate)' : 'Show Breakdown Rates (Achieve Rate & Broken Rate)';
    btn.innerHTML = agParams.isExpanded() ? '<i class="bi bi-dash"></i>' : '<i class="bi bi-plus"></i>';

    btn.addEventListener('mouseenter', () => {
      btn.classList.remove('bg-light', 'text-secondary');
      btn.classList.add('bg-primary-subtle', 'text-primary', 'border-primary');
    });
    btn.addEventListener('mouseleave', () => {
      btn.classList.remove('bg-primary-subtle', 'text-primary', 'border-primary');
      btn.classList.add('bg-light', 'text-secondary');
    });

    this.eGui.appendChild(title);
    this.eGui.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      agParams.onExpandClicked();
      btn.title = agParams.isExpanded() ? 'Hide Breakdown Rates (Achieve Rate & Broken Rate)' : 'Show Breakdown Rates (Achieve Rate & Broken Rate)';
      btn.innerHTML = agParams.isExpanded() ? '<i class="bi bi-dash"></i>' : '<i class="bi bi-plus"></i>';
    });
  }

  refresh(params: any): boolean {
    this.agParams = params;
    const btn = this.eGui.querySelector('span.badge') as HTMLElement;
    if (btn) {
      btn.title = params.isExpanded() ? 'Hide Breakdown Rates (Achieve Rate & Broken Rate)' : 'Show Breakdown Rates (Achieve Rate & Broken Rate)';
      btn.innerHTML = params.isExpanded() ? '<i class="bi bi-dash"></i>' : '<i class="bi bi-plus"></i>';
    }
    return true;
  }

  getGui() { return this.eGui; }
  destroy() {}
}

@Component({
  selector: 'app-forecast-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular],
  templateUrl: './forecast-dashboard.component.html',
  styleUrl: './forecast-dashboard.component.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '(document:click)': 'closeAllDropdowns()'
  }
})
export class ForecastDashboardComponent implements OnInit, OnDestroy {
  isDetailViewOpen = false;
  selectedRowData: any = null;

  closeDetailView() {
    this.isDetailViewOpen = false;
    setTimeout(() => {
      this.applyViewModeColumns();
      if (this.purchaseGridApi) {
        this.purchaseGridApi.redrawRows();
      }
      if (this.forecastGridApi) {
        this.forecastGridApi.redrawRows();
      }
    }, 200);
  }


  // Module Views State
  purchaseViewMode: 'overview' | 'on-hand' | 'inventory' | 'po' | 'pr' | 'usage' | 'parameters' | 'summary-orders' | 'orders-date' | 'vendor' | 'price' | 'daily' = 'overview';
  summaryOrdersRowData: any[] = [];

  get displayedPurchaseRowData(): any[] {
    return this.purchaseViewMode === 'parameters' ? this.purchaseRowData : this.summaryOrdersRowData;
  }

  showAdvancedRates: boolean = false;

  toggleAdvancedRates() {
    this.showAdvancedRates = !this.showAdvancedRates;
    this.applyViewModeColumns();
  }

  targetOrderMonthOffset: number = 0;
  selectedRateMonth: string = 'default';
  currentBulkRates: Record<string, string> = {
    'default': '%',
    'M1': '%',
    'M2': '%',
    'M3': '%',
    'M4': '%',
    'M5': '%'
  };

  forecastPaginationPagesArr: (number | string)[] = [];
  rawPurchaseResult: any = null;
  itemPartViewMode: 'item_part' | 'item_only' = 'item_part';

  getRowId = (params: any) => {
    return params.data.id || `${params.data._realItemNo || params.data.itemNo || ''}___${params.data.partNo || ''}___${params.data.process || ''}___${params.data.position || ''}` || params.node.id;
  };

  toggleItemPartMode() {
    this.itemPartViewMode = this.itemPartViewMode === 'item_part' ? 'item_only' : 'item_part';
    if (this.rawPurchaseResult) {
      const r = this.rawPurchaseResult;
      this.processPurchaseData(r.pcPlanData, r.poData, r.prData, r.usageData, r.stockData, r.dailyIssueData, r.dailyStockSummary, r.dailyCuttingtoolsInventory);
    } else if (this.forecastRowData && this.forecastRowData.length > 0) {
      this.processPurchaseData(this.forecastRowData, [], [], [], [], [], [], []);
    }
  }

  targetMonthOptions: {offset: number, label: string}[] = [];
  selectedDailyForecastMonthOffset: number = 0;
  manualConfirmQtyMap: Record<string, number | null> = {};
  carryForwardBalances = new Map<string, number>();

  showMissingItemNo: boolean = false;
  allForecastRowData: any[] = [];
  allPurchaseRowData: any[] = [];

  onShowMissingToggleChange() {
    this.applyMissingItemFilter();
  }

  applyMissingItemFilter() {
    const isMissing = (item: any) => !item.itemNo || item.itemNo === '0' || item.itemNo === '-';

    // Process Forecast Data
    const fData = this.showMissingItemNo ? this.allForecastRowData : this.allForecastRowData.filter(item => !isMissing(item));
    this.forecastRowData = this.processGridData(fData);
    this.pendingForecastData = this.forecastRowData; // Ensure it renders if tab switches

    // Process Purchase Data
    const pData = this.showMissingItemNo ? this.allPurchaseRowData : this.allPurchaseRowData.filter(item => !isMissing(item));
    this.purchaseRowData = pData.map((item, i) => ({ ...item, no: i + 1 }));

    if (this.purchaseGridApi) {
      if (this.purchaseViewMode === 'parameters') {
        this.purchaseGridApi.setGridOption('rowData', this.purchaseRowData);
      } else {
        this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
        this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
      }
    }
  }

  getPreviousMonth(month: string, year: string): { prevMonth: string, prevYear: string } {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const idx = months.indexOf(month);
    if (idx === -1) return { prevMonth: month, prevYear: year };
    if (idx === 0) return { prevMonth: 'December', prevYear: (parseInt(year) - 1).toString() };
    return { prevMonth: months[idx - 1], prevYear: year };
  }

  onTargetOrderMonthChange() {
    const updatedData = [...this.purchaseRowData];
    for (let i = 0; i < updatedData.length; i++) {
        const row = { ...updatedData[i] };
        const orderPlan = this.calculateOrderPlan(row);
        Object.assign(row, orderPlan);
        updatedData[i] = row;
    }
    this.purchaseRowData = updatedData;
    if (this.purchaseGridApi) {
      if (this.purchaseViewMode === 'parameters') {
        this.purchaseGridApi.setGridOption('rowData', updatedData);
      } else {
        this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
        this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
      }
      this.purchaseGridApi.onFilterChanged();
    }
    this.cdr.detectChanges();
  }

  onDailyForecastMonthChange() {
    this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
    const updatedData = [...this.purchaseRowData];
    for (let i = 0; i < updatedData.length; i++) {
      const row = { ...updatedData[i] };
      let targetDailyForecast = row.planSetup;
      let targetPo = row.in;
      let targetPr = row.pr;
      if (this.selectedDailyForecastMonthOffset === 1) {
        targetDailyForecast = row.issM1;
        targetPo = row.m1Po;
        targetPr = row.m1Request;
      } else if (this.selectedDailyForecastMonthOffset === 2) {
        targetDailyForecast = row.issM2;
        targetPo = row.m2Po;
        targetPr = row.m2Request;
      } else if (this.selectedDailyForecastMonthOffset === 3) {
        targetDailyForecast = row.issM3;
        targetPo = row.m3Po;
        targetPr = row.m3Request;
      } else if (this.selectedDailyForecastMonthOffset === 4) {
        targetDailyForecast = row.issM4;
        targetPo = row.m4Po;
        targetPr = row.m4Request;
      } else if (this.selectedDailyForecastMonthOffset === 5) {
        targetDailyForecast = row.issM5;
        targetPo = row.m5Po;
        targetPr = row.m5Request;
      }

      row.dailyTotalSupply = (row.stockOnHand || 0) + (Number(targetPo) || 0) + (Number(targetPr) || 0);
      row.balanceIssue = (targetDailyForecast || 0) - (row.issue || 0);
      row.blUseMonth = row.dailyTotalSupply - row.balanceIssue;
      updatedData[i] = row;
    }
    this.purchaseRowData = updatedData;

    this.applyViewModeColumns();
    if (this.purchaseGridApi) {
      const activeData = (this.purchaseViewMode === 'parameters') ? this.purchaseRowData : this.summaryOrdersRowData;
      this.purchaseGridApi.setGridOption('rowData', activeData);
      this.purchaseGridApi.refreshHeader();
    }
    this.cdr.detectChanges();
  }

  // Add Item Modal State
  showAddItemModal = false;
  addManualItemNo = '';
  addManualQty: number | null = null;
  vendorItems: any[] = [];

  openEngineerUsagePopup(data: any) {
    if (!data || !data.partUsageDetailsArray || data.partUsageDetailsArray.length === 0) return;

    let html = `<table class="table table-bordered table-sm text-center">
                  <thead class="table-light">
                    <tr>
                      <th>Part No</th>
                      <th>Part QTY</th>
                      <th>Master Usage</th>
                    </tr>
                  </thead>
                  <tbody>`;
    let totalQty = 0;
    let totalWeight = 0;
    let calcHtml = `<div class="text-start mt-3 p-3 bg-light rounded border" style="font-size: 0.9rem;">
                      <div class="fw-bold mb-2"><i class="bi bi-calculator me-1"></i> วิธีคำนวณค่าเฉลี่ยแบบถ่วงน้ำหนัก:</div>
                      <ul class="list-unstyled ms-2 mb-2">`;

    data.partUsageDetailsArray.forEach((p: any) => {
      html += `<tr>
                 <td>${p.partNo}</td>
                 <td>${p.qty.toLocaleString()}</td>
                 <td>${p.usage.toLocaleString()}</td>
               </tr>`;

      const weight = p.qty * p.usage;
      totalQty += p.qty;
      totalWeight += weight;
      calcHtml += `<li class="mb-1">
                     &bull; <strong>${p.partNo}:</strong> <code>${p.qty.toLocaleString()}</code> &times; <code>${p.usage.toLocaleString()}</code> = <code class="text-secondary">${weight.toLocaleString()}</code>
                   </li>`;
    });
    html += `</tbody></table>`;

    const avg = totalQty > 0 ? Math.round(totalWeight / totalQty) : 0;
    calcHtml += `</ul>
                 <hr class="my-2">
                 <div class="ms-2">
                   <div><strong>ผลรวมค่าน้ำหนัก:</strong> <code>${totalWeight.toLocaleString()}</code></div>
                   <div><strong>ยอดผลิตรวม:</strong> <code>${totalQty.toLocaleString()}</code> ชิ้น</div>
                   <div class="mt-2 text-primary fs-6">
                     <strong>ค่าเฉลี่ยที่ได้:</strong> ${totalWeight.toLocaleString()} &divide; ${totalQty.toLocaleString()} = <span class="fw-bold text-decoration-underline ms-1">${avg.toLocaleString()}</span>
                   </div>
                 </div>
               </div>`;

    html += calcHtml;

    Swal.fire({
      title: 'Engineer Usage Breakdown',
      html: `<div class="mb-3 fs-5 text-muted">${data.itemNo}</div>` + html,
      width: '600px',
      showConfirmButton: true,
      confirmButtonText: 'Close',
      customClass: {
        confirmButton: 'btn btn-primary px-4'
      }
    });
  }

  openPartNoPopup(data: any) {
    if (!data) return;

    const itemNo = data._realItemNo || data.itemNo || '-';
    const itemName = data.name || '-';
    const spec = data.spec || '-';

    let partsList: Array<{ partNo: string, qty?: number, usage?: number }> = [];

    if (data.partUsageDetailsArray && data.partUsageDetailsArray.length > 0) {
      partsList = data.partUsageDetailsArray.map((p: any) => ({
        partNo: p.partNo,
        qty: p.qty,
        usage: p.usage,
        isBroken100: p.isBroken100 || p.brokenRate === 100,
        brokenAlert: p.brokenAlert,
        brokenRate: p.brokenRate
      }));
    } else if (data.allPartNos && data.allPartNos.length > 0) {
      partsList = data.allPartNos.map((p: string) => ({ partNo: p }));
    } else if (data.partNo && data.partNo !== '-') {
      const parts = String(data.partNo).split(',').map((p: string) => p.trim()).filter((p: string) => p && p !== '...');
      partsList = parts.map((p: string) => ({ partNo: p }));
    }

    if (partsList.length === 0) {
      Swal.fire({
        title: 'Part No Information',
        html: `<div class="text-muted p-2">ไม่พบข้อมูล Part No สำหรับไอเทมนี้</div>`,
        icon: 'info',
        confirmButtonText: 'ปิด',
        customClass: { confirmButton: 'btn btn-primary px-4' }
      });
      return;
    }

    let rowsHtml = '';
    partsList.forEach((p, idx) => {
      let bBadge = '';
      if ((p as any).isBroken100) {
        bBadge = `<span class="badge bg-danger text-white ms-2" style="font-size: 0.72rem;"><i class="bi bi-exclamation-octagon-fill me-1"></i>Broken 100% (อิงตาม Engineer Usage)</span>`;
      } else if ((p as any).brokenAlert) {
        bBadge = `<span class="badge bg-warning text-dark ms-2" style="font-size: 0.72rem;"><i class="bi bi-exclamation-triangle-fill me-1"></i>Broken ${(p as any).brokenRate}%</span>`;
      }
      rowsHtml += `
        <tr>
          <td class="text-muted small align-middle" style="width: 50px;">${idx + 1}</td>
          <td class="fw-bold text-primary text-start align-middle font-monospace" style="font-size: 0.95rem;">
            ${p.partNo} ${bBadge}
          </td>
        </tr>`;
    });

    const allPartText = partsList.map(p => p.partNo).join(', ');

    const tableHtml = `
      <div class="text-start mb-3 p-3 bg-light rounded-3 border">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted small">Item No:</span>
          <span class="fw-bold text-dark font-monospace">${itemNo}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted small">Name:</span>
          <span class="fw-medium text-dark text-truncate ms-2">${itemName}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center">
          <span class="text-muted small">Spec:</span>
          <span class="text-secondary small ms-2">${spec}</span>
        </div>
      </div>

      <div class="d-flex justify-content-between align-items-center mb-2 px-1">
        <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1">
          <i class="bi bi-cpu me-1"></i> รวมทั้งหมด ${partsList.length} Part No
        </span>
        <button id="copyAllPartsBtn" class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size: 0.78rem;">
          <i class="bi bi-clipboard me-1"></i> Copy ทั้งหมด
        </button>
      </div>

      <div class="table-responsive" style="max-height: 360px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table class="table table-hover table-striped table-sm mb-0 text-center">
          <thead class="table-light sticky-top" style="z-index: 1;">
            <tr>
              <th style="width: 50px;">#</th>
              <th class="text-start">Part No</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    Swal.fire({
      title: `<span class="fs-5 fw-bold text-dark"><i class="bi bi-list-check text-primary me-2"></i>รายละเอียด Part No</span>`,
      html: tableHtml,
      width: '480px',
      showConfirmButton: true,
      confirmButtonText: 'ปิด',
      customClass: {
        confirmButton: 'btn btn-primary px-4'
      },
      didOpen: () => {
        const copyBtn = document.getElementById('copyAllPartsBtn');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(allPartText).then(() => {
              copyBtn.innerHTML = '<i class="bi bi-check2 text-success me-1"></i> คัดลอกแล้ว!';
              setTimeout(() => {
                copyBtn.innerHTML = '<i class="bi bi-clipboard me-1"></i> Copy ทั้งหมด';
              }, 2000);
            });
          });
        }
      }
    });
  }

  openAvgUsagePopup(data: any) {
    if (!data || !data.partUsageDetailsArray || data.partUsageDetailsArray.length === 0) return;

    if (this.itemPartViewMode === 'item_part' && data.partNo && data.partNo !== '-') {
      const p = data.partUsageDetailsArray[0];
      const hasHist = p && p.realAvgUsage != null;
      let singleHtml = `
        <div class="card border p-3 rounded-3 bg-light mb-3 text-start">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="text-muted small fw-bold">Part No:</span>
            <span class="fw-bold text-primary font-monospace fs-6">${data.partNo}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="text-muted small fw-bold">แผนผลิตชิ้นงาน (Workpiece QTY):</span>
            <span class="fw-bold font-monospace">${(p?.qty || data.forecastPd || 0).toLocaleString()} ชิ้น</span>
          </div>
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="text-muted small fw-bold">สเปกวิศวกรรม (Engineer Life):</span>
            <span class="fw-bold font-monospace">${(data.usagePcs || 0).toLocaleString()} pcs/tool</span>
          </div>
          <hr class="my-2">
          <div class="d-flex justify-content-between align-items-center">
            <span class="fw-bold">ประวัติการใช้งานจริง (Historical Avg):</span>
            <span class="fs-5 fw-bold ${hasHist ? 'text-primary' : 'text-danger'}">
              ${hasHist ? p.realAvgUsage.toLocaleString() + ' pcs/tool' : 'N/A (ไม่มีประวัติ)'}
            </span>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <span class="text-muted small fw-bold">Broken Rate ของ Part นี้:</span>
            <span class="fw-bold text-secondary font-monospace">${(data.pB != null ? data.pB : 1).toFixed(2)}</span>
          </div>
        </div>
      `;

      if (data.isBroken100 || (p && (p.isBroken100 || p.brokenRate === 100))) {
        singleHtml += `
          <div class="alert alert-danger text-start small mb-0 shadow-sm border border-danger">
            <div class="d-flex align-items-center mb-1">
              <i class="bi bi-exclamation-octagon-fill text-danger fs-5 me-2"></i>
              <strong class="text-danger">ข้อควรระวัง: ประวัติการเบิกมีสถานะ Broken 100%</strong>
            </div>
            <span>Part นี้มีประวัติการเบิกใช้งานแล้วแตกหักทั้งหมด (100%) เพื่อป้องกันค่าคำนวณสั่งซื้อผิดพลาด ระบบจึงตั้งค่า Avg Usage <strong>อิงตามสเปกวิศวกรรม (Engineer Usage)</strong> = <code>${(data.usagePcs || 0).toLocaleString()} pcs/tool</code> และ Achieve Rate = <code>100%</code></span>
          </div>
        `;
      } else if (data.brokenAlert || (p && (p.brokenAlert || p.brokenRate > 50))) {
        const ach = ((p.realAvgUsage / (data.usagePcs || 1)) * 100).toFixed(2);
        const bRate = (p && p.brokenRate) ? p.brokenRate : (data.brokenRate || 0);
        singleHtml += `
          <div class="alert alert-warning text-start small mb-0 shadow-sm border border-warning">
            <div class="d-flex align-items-center mb-1">
              <i class="bi bi-exclamation-triangle-fill text-warning fs-5 me-2"></i>
              <strong class="text-dark">ข้อควรระวัง: มีอัตราแตกหักสูง (${bRate}%)</strong>
            </div>
            <span>ระบบได้ตัดรายการแตกหัก (Broken) ออกจากการคำนวณค่าเฉลี่ย โดยคิดจากรายการใช้งานปกติ และแจ้งเตือนให้เฝ้าระวังอัตราแตกหัก</span>
            <div class="mt-2 pt-2 border-top">
              <strong>Achieve Rate:</strong> <code>(${p.realAvgUsage.toLocaleString()} &divide; ${(data.usagePcs || 1).toLocaleString()}) &times; 100 = ${ach}%</code>
            </div>
          </div>
        `;
      } else if (hasHist) {
        const ach = ((p.realAvgUsage / (data.usagePcs || 1)) * 100).toFixed(2);
        singleHtml += `
          <div class="alert alert-info text-start small mb-0">
            <i class="bi bi-info-circle-fill me-1"></i>
            <strong>การคิด Achieve Rate ของ Part นี้:</strong><br>
            <code>(${p.realAvgUsage.toLocaleString()} &divide; ${(data.usagePcs || 1).toLocaleString()}) &times; 100 = ${ach}%</code>
          </div>
        `;
      } else {
        singleHtml += `
          <div class="alert alert-warning text-start small mb-0">
            <i class="bi bi-exclamation-circle-fill me-1"></i>
            <strong>ไม่มีประวัติการเบิกใช้จริงในระบบ:</strong><br>
            ระบบจึงตั้งค่าเริ่มต้น Achieve Rate เป็น <code>100%</code> และสั่งซื้อตามเป้า Safety Target (Normal Rate <code>120%</code>)
          </div>
        `;
      }

      Swal.fire({
        title: 'Avg Usage Detail',
        html: `<div class="mb-2 fs-5 text-muted">${data.itemNo}</div>` + singleHtml,
        width: '520px',
        showConfirmButton: true,
        confirmButtonText: 'Close',
        customClass: {
          confirmButton: 'btn btn-primary px-4'
        }
      });
      return;
    }

    let html = '';
    if (data.brokenAlert) {
      html += `<div class="alert alert-warning text-start mb-3" role="alert">
                 <i class="bi bi-exclamation-triangle-fill me-2"></i> <strong>ข้อควรระวัง:</strong> ทูลตัวนี้มีประวัติการใช้แล้วแตกหัก (Broken) บ่อยครั้งในบาง Part <br>
                 <small>(ระบบตัดประวัติแตกหัก (Broken) ออกจากการคำนวณค่าเฉลี่ย โดยคิดจากรายการใช้งานปกติ และแจ้งเตือนให้เฝ้าระวังอัตราแตกหัก)</small>
               </div>`;
    }

    html += `<table class="table table-bordered table-sm text-center">
                  <thead class="table-light">
                    <tr>
                      <th>Part No</th>
                      <th>Part QTY</th>
                      <th>Historical Avg</th>
                    </tr>
                  </thead>
                  <tbody>`;
    let totalQty = 0;
    let totalWeight = 0;
    let calcHtml = `<div class="text-start mt-3 p-3 bg-light rounded border" style="font-size: 0.9rem;">
                      <div class="fw-bold mb-2"><i class="bi bi-calculator me-1"></i> วิธีคำนวณค่าเฉลี่ยตามยอดผลิต (Weighted Average):</div>
                      <div class="small text-muted mb-3">*หาก Part ใดไม่มีประวัติเบิกใช้งานในอดีต ระบบจะดึงค่า Spec/Plan มาใช้คำนวณแทน</div>
                      <ul class="list-unstyled ms-2 mb-2">`;

    data.partUsageDetailsArray.forEach((p: any) => {
      let isNA = (p.realAvgUsage == null);
      let isFallback = p.isFallback;
      let isBroken100 = p.isBroken100 || (p.brokenRate === 100);
      let usageText = isNA ? '<span class="text-danger fw-bold">N/A</span>'
                           : (isBroken100 ? `<span class="text-danger fw-bold">${p.realAvgUsage.toLocaleString()}</span> <br><small class="text-danger fw-bold">(Broken 100% - อิง Spec)</small>`
                           : (isFallback ? `<span class="text-warning fw-bold">${p.realAvgUsage.toLocaleString()}</span> <br><small class="text-muted">(Spec)</small>`
                                         : p.realAvgUsage.toLocaleString()));

      let partDisplay = p.partNo;
      if (isBroken100) {
         partDisplay += ` <span class="badge bg-danger text-white ms-1 px-1.5 py-0" style="font-size: 0.7rem;"><i class="bi bi-exclamation-octagon-fill me-1"></i>Broken 100%</span>`;
      } else if (p.brokenAlert) {
         partDisplay += ` <i class="bi bi-exclamation-triangle-fill text-warning" title="Warning: มีประวัติแตกหักสูงถึง ${p.brokenRate}%"></i>`;
      }

      html += `<tr>
                 <td>${partDisplay}</td>
                 <td>${p.qty.toLocaleString()}</td>
                 <td>${usageText}</td>
               </tr>`;

      if (isNA) {
         calcHtml += `<li class="mb-2">
                        &bull; <strong>${p.partNo}:</strong> แผนผลิต <code>${p.qty.toLocaleString()}</code> ชิ้น
                        <i class="bi bi-arrow-right mx-1"></i> <span class="text-muted fst-italic">(ไม่มีประวัติ & ไม่มี Spec ข้ามการคำนวณ)</span>
                      </li>`;
      } else {
         const weight = p.qty * p.realAvgUsage;
         totalQty += p.qty;
         totalWeight += weight;
         const sourceText = isBroken100 ? '<span class="text-danger fw-bold">Broken 100% (Spec)</span>' : (isFallback ? '<span class="text-warning fw-bold">Spec</span>' : 'ประวัติ');
         let alertSuffix = '';
         if (isBroken100) {
            alertSuffix = `<br><span class="ms-3 text-danger fw-semibold" style="font-size: 0.8rem;"><i class="bi bi-exclamation-octagon-fill"></i> ประวัติ Broken 100% ระบบจึงใช้วิธีอิงตามสเปกวิศวกรรม (Spec)</span>`;
         } else if (p.brokenAlert) {
            alertSuffix = `<br><span class="ms-3 text-warning" style="font-size: 0.8rem;"><i class="bi bi-exclamation-triangle-fill"></i> แตกหักบ่อย ${p.brokenRate}% (ตัดรายการ Broken ออกจากการคำนวณ)</span>`;
         }
         calcHtml += `<li class="mb-2">
                        &bull; <strong>${p.partNo}:</strong> แผนผลิต <code>${p.qty.toLocaleString()}</code> ชิ้น &times; ${sourceText} <code>${p.realAvgUsage.toLocaleString()}</code> = <code class="text-secondary">${weight.toLocaleString()}</code>
                        ${alertSuffix}
                      </li>`;
      }
    });
    html += `</tbody></table>`;

    calcHtml += `</ul>
                 <hr class="my-2">
                 <div class="ms-2">
                   <div class="fw-bold mb-1">สรุปตัวเลขนำไปคำนวณ:</div>
                   <div>&#9656; <strong>ผลรวมค่าน้ำหนัก:</strong> <code class="fs-6">${totalWeight.toLocaleString()}</code></div>
                   <div>&#9656; <strong>ยอดผลิตรวม (เฉพาะที่มีประวัติ):</strong> <code class="fs-6">${totalQty.toLocaleString()}</code> ชิ้น</div>`;

    if (totalQty > 0) {
      const avg = Math.round(totalWeight / totalQty);
      calcHtml += `<div class="mt-2 text-primary fs-6">
                     <strong>ผลลัพธ์ (Avg Usage):</strong> ${totalWeight.toLocaleString()} &divide; ${totalQty.toLocaleString()} = <span class="fw-bold text-decoration-underline ms-1 fs-5">${avg.toLocaleString()}</span>
                   </div>`;
    } else {
      calcHtml += `<div class="mt-2 text-danger fs-6">
                     <strong>* ไม่มี Part ใดมีประวัติ:</strong> ระบบจึงไม่สามารถคำนวณค่าเฉลี่ยได้ = <span class="fw-bold text-decoration-underline ms-1 fs-5">N/A</span>
                   </div>`;
    }
    calcHtml += `</div>
               </div>`;

    html += calcHtml;

    Swal.fire({
      title: 'Avg Usage Breakdown',
      html: `<div class="mb-3 fs-5 text-muted">${data.itemNo}</div>` + html,
      width: '600px',
      showConfirmButton: true,
      confirmButtonText: 'Close',
      customClass: {
        confirmButton: 'btn btn-primary px-4'
      }
    });
  }

  openAddItemModal() {
    this.addManualItemNo = '';
    this.addManualQty = null;
    const sourceData = this.purchaseViewMode === 'parameters' ? this.purchaseRowData : this.summaryOrdersRowData;
    if (this.selectedVendor === 'All Vendors') {
      this.vendorItems = sourceData;
    } else {
      this.vendorItems = sourceData.filter(d => d.vendorName === this.selectedVendor);
    }
    this.showAddItemModal = true;
  }

  closeAddItemModal() {
    this.showAddItemModal = false;
  }

  confirmAddItem() {
    if (!this.addManualItemNo || !this.addManualQty || this.addManualQty <= 0) return;
    const searchItemNo = this.addManualItemNo.trim().toUpperCase();
    const selectedOffset = Number(this.targetOrderMonthOffset) || 0;
    const key = `${searchItemNo}_${selectedOffset}`;
    this.manualConfirmQtyMap[key] = this.addManualQty;

    // Trigger recalculation for this row
    const updatedData = [...this.purchaseRowData];
    const rowIndex = updatedData.findIndex(d => String(d._realItemNo || d.itemNo).toUpperCase() === searchItemNo);
    if (rowIndex > -1) {
      const row = { ...updatedData[rowIndex] };
      const orderPlan = this.calculateOrderPlan(row);
      Object.assign(row, orderPlan);
      updatedData[rowIndex] = row;
      this.purchaseRowData = updatedData;
      if (this.purchaseGridApi) {
        if (this.purchaseViewMode === 'parameters') {
          this.purchaseGridApi.setGridOption('rowData', updatedData);
        } else {
          this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
          this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
        }
        this.purchaseGridApi.onFilterChanged();
      }
    }
    this.closeAddItemModal();
  }

  // Custom Pagination State
  currentPage: number = 1;
  totalPages: number = 1;
  totalRows: number = 0;
  pageSize: number = 50;

  // Custom Pagination State (Forecast)
  forecastCurrentPage: number = 1;
  forecastTotalPages: number = 1;
  forecastTotalRows: number = 0;
  forecastPageSize: number = 50;
  paginationPagesArr: (number | string)[] = [];

  setPurchaseViewMode(mode: 'overview' | 'on-hand' | 'inventory' | 'po' | 'pr' | 'usage' | 'parameters' | 'summary-orders' | 'orders-date' | 'vendor' | 'price' | 'daily') {
    this.purchaseViewMode = mode;
    if (!['overview', 'on-hand', 'inventory', 'orders-date', 'daily'].includes(mode) && this.currentPurchaseFilter !== 'all') {
      this.setPurchaseFilter('all');
    }
    this.applyViewModeColumns();
    if (mode === 'parameters') {
      if (this.purchaseGridApi) {
        this.purchaseGridApi.setGridOption('rowData', this.purchaseRowData);
      }
    } else {
      this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
      if (this.purchaseGridApi) {
        this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
      }
    }
    if (this.purchaseGridApi) {
      this.purchaseGridApi.onFilterChanged();
    }
  }

  applyViewModeColumns() {
    const updatedDefs = this.purchaseColDefs.map(col => ({ ...col }));

    // Overview (Monthly) Fields:
    const overviewFields = [
      'inventoryPd', 'inventoryPh', 'receive', 'in', 'pr', 'totalSupply', 'planSetup', 'end',
      'm1Beg', 'm1Po', 'm1Request', 'issM1', 'm1End',
      'm2Beg', 'm2Po', 'm2Request', 'issM2', 'm2End',
      'm3Beg', 'm3Po', 'm3Request', 'issM3', 'm3End',
      'm4Beg', 'm4Po', 'm4Request', 'issM4', 'm4End',
      'm5Beg', 'm5Po', 'm5Request', 'issM5', 'm5End'
    ];
    const usageFields = ['forecastPd', 'm1Forecast', 'm2Forecast', 'm3Forecast', 'm4Forecast', 'm5Forecast'];

    const onHandFields = ['stkPd', 'stkPh', 'beg', 'receive'];
    const inventoryFields = ['inventoryPd', 'inventoryPh', 'sumInventory'];
    const poFields = ['in', 'm1Po', 'm2Po', 'm3Po', 'm4Po', 'm5Po'];
    const prFields = ['pr', 'm1Request', 'm2Request', 'm3Request', 'm4Request', 'm5Request'];

    const normalField = this.selectedRateMonth === 'default' ? 'normalRate' : `normalRate${this.selectedRateMonth}`;
    const orderField = this.selectedRateMonth === 'default' ? 'orderRate' : `orderRate${this.selectedRateMonth}`;
    const parameterFields = ['usagePcs', 'avgUsage', 'advanceAchieveRate', 'advOrderQty', 'achieveRate', 'pB'];
    const m = (this.selectedRateMonth || 'default').toUpperCase();
    let advOrderField = 'sumAdvOrderQty';
    let summaryOrderField = 'summaryOrderQty';
    if (m === 'M1') {
      advOrderField = 'sumAdvOrderQtyM1';
      summaryOrderField = 'summaryOrderQtyM1';
    } else if (m === 'M2') {
      advOrderField = 'sumAdvOrderQtyM2';
      summaryOrderField = 'summaryOrderQtyM2';
    } else if (m === 'M3') {
      advOrderField = 'sumAdvOrderQtyM3';
      summaryOrderField = 'summaryOrderQtyM3';
    } else if (m === 'M4') {
      advOrderField = 'sumAdvOrderQtyM4';
      summaryOrderField = 'summaryOrderQtyM4';
    } else if (m === 'M5') {
      advOrderField = 'sumAdvOrderQtyM5';
      summaryOrderField = 'summaryOrderQtyM5';
    }
    const summaryOrdersFields = ['normalRate', 'orderRate', advOrderField, summaryOrderField];

    const ordersDateFields = ['lt', 'shortageMonth', 'suggestOrderDate', 'dueDate', 'suggestOrderQty', 'confirmQty', 'orderStatus', 'minBalance'];
    const vendorFields = ['dueDate', 'confirmQty', 'unitPrice', 'amount', 'vendorCode', 'vendorName', 'deleteAction'];
    const priceFields = ['confirmQty', 'unitPrice', 'amount', 'vendorName'];

    let dailyForecastField = 'planSetup';
    let dailyPoField = 'in';
    let dailyPrField = 'pr';

    if (this.selectedDailyForecastMonthOffset === 1) {
      dailyForecastField = 'issM1';
      dailyPoField = 'm1Po';
      dailyPrField = 'm1Request';
    } else if (this.selectedDailyForecastMonthOffset === 2) {
      dailyForecastField = 'issM2';
      dailyPoField = 'm2Po';
      dailyPrField = 'm2Request';
    } else if (this.selectedDailyForecastMonthOffset === 3) {
      dailyForecastField = 'issM3';
      dailyPoField = 'm3Po';
      dailyPrField = 'm3Request';
    } else if (this.selectedDailyForecastMonthOffset === 4) {
      dailyForecastField = 'issM4';
      dailyPoField = 'm4Po';
      dailyPrField = 'm4Request';
    } else if (this.selectedDailyForecastMonthOffset === 5) {
      dailyForecastField = 'issM5';
      dailyPoField = 'm5Po';
      dailyPrField = 'm5Request';
    }

    const dailyFields = [
      'stkPh',
      'stkPd',
      dailyPoField,
      dailyPrField,
      'dailyTotalSupply',
      dailyForecastField,
      'issue',
      'balanceIssue',
      'blUseMonth',
      'issueDate'
    ];

    const pinnedFields = (this.purchaseViewMode === 'orders-date')
      ? ['selection', 'no', 'itemNo', 'name', 'spec', 'partNo']
      : (this.purchaseViewMode === 'parameters')
        ? ['no', 'itemNo', 'name', 'spec', 'partNo', 'process', 'position']
        : ['no', 'itemNo', 'name', 'spec', 'partNo'];
    const alwaysHidden = ['targetMonth'];

    updatedDefs.forEach(col => {
      if (this.purchaseViewMode === 'overview') {
        col.suppressMovable = true;
        col.resizable = true;
        if (col.width && !col.minWidth) {
          col.minWidth = Math.min(col.width, 100);
          col.suppressSizeToFit = true;
        }
      } else {
        col.suppressMovable = false;
        col.resizable = true;
        delete col.minWidth;
        delete col.suppressSizeToFit;
      }

      if (alwaysHidden.includes(col.field)) {
        col.hide = true;
        col.pinned = null;
      } else if (pinnedFields.includes(col.field)) {
        col.hide = false;
        col.pinned = 'left';
      } else {
         let shouldShow = false;
         delete col.flex; // Reset flex

         if (this.purchaseViewMode === 'overview' && overviewFields.includes(col.field)) {
           shouldShow = true;
         }
         if (this.purchaseViewMode === 'on-hand' && onHandFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'inventory' && inventoryFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'po' && poFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'pr' && prFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'usage' && usageFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'parameters' && parameterFields.includes(col.field)) {
           shouldShow = true;
           if (!this.showAdvancedRates && (col.field === 'achieveRate' || col.field === 'pB')) {
              shouldShow = false;
           }
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'summary-orders' && summaryOrdersFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'orders-date' && ordersDateFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'vendor' && vendorFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'price' && priceFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
         }
         if (this.purchaseViewMode === 'daily' && dailyFields.includes(col.field)) {
           shouldShow = true;
           col.flex = 1;
           col.minWidth = 100;
         }

         if (col.field === 'selection') {
           shouldShow = this.purchaseViewMode === 'orders-date';
         }
        if (col.field === 'dueDate') {
          shouldShow = (this.purchaseViewMode === 'orders-date' || this.purchaseViewMode === 'vendor');
          col.headerName = this.purchaseViewMode === 'vendor' ? 'Delivery Date' : 'Due Date';
        }
         if (col.field === 'confirmQty') {
           col.headerName = (this.purchaseViewMode === 'vendor' || this.purchaseViewMode === 'price') ? 'Order Qty' : 'Confirm Order';
         }
         if (this.purchaseViewMode === 'daily') {
           const selectedMonthOption = this.targetMonthOptions.find(o => o.offset === this.selectedDailyForecastMonthOffset);
           const monthLabel = selectedMonthOption ? selectedMonthOption.label.split(' ')[0] : (this.selectedMonth || 'Sep').substring(0, 3);
           if (col.field === dailyPoField) {
             col.headerName = `PO ${monthLabel}`;
           }
           if (col.field === dailyPrField) {
             col.headerName = `PR ${monthLabel}`;
           }
           if (col.field === 'dailyTotalSupply') {
             col.headerName = `Total Supply ${monthLabel}`;
           }
           if (col.field === dailyForecastField) {
             col.headerName = `Forecast ${monthLabel}`;
           }
           if (col.field === 'blUseMonth') {
             col.headerName = `Balance Use ${monthLabel}`;
           }
         } else if (col.field === 'blUseMonth') {
           col.headerName = `Balance Use ${(this.selectedMonth || 'Sep').substring(0, 3)}`;
         }

         col.hide = !shouldShow;
         if (col.hide) {
           col.pinned = null;
         }
      }
    });

    let fieldOrder: string[] = [];
    switch (this.purchaseViewMode) {
      case 'overview': fieldOrder = [...pinnedFields, ...overviewFields]; break;
      case 'on-hand': fieldOrder = [...pinnedFields, ...onHandFields]; break;
      case 'inventory': fieldOrder = [...pinnedFields, ...inventoryFields]; break;
      case 'po': fieldOrder = [...pinnedFields, ...poFields]; break;
      case 'pr': fieldOrder = [...pinnedFields, ...prFields]; break;
      case 'usage': fieldOrder = [...pinnedFields, ...usageFields]; break;
      case 'parameters': fieldOrder = [...pinnedFields, ...parameterFields]; break;
      case 'summary-orders': fieldOrder = [...pinnedFields, ...summaryOrdersFields]; break;
      case 'orders-date': fieldOrder = [...pinnedFields, ...ordersDateFields]; break;
      case 'vendor': fieldOrder = [...pinnedFields, ...vendorFields]; break;
      case 'price': fieldOrder = [...pinnedFields, ...priceFields]; break;
      case 'daily': fieldOrder = [...pinnedFields, ...dailyFields]; break;
      default: fieldOrder = [...pinnedFields];
    }

    let finalDefs = [...updatedDefs].sort((a, b) => {
      const idxA = fieldOrder.indexOf(a.field);
      const idxB = fieldOrder.indexOf(b.field);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    this.purchaseColDefs = finalDefs;
    if (this.purchaseGridApi) {
      this.purchaseGridApi.setGridOption('columnDefs', this.purchaseColDefs);

      const colState = finalDefs.map(col => ({
        colId: col.field,
        hide: col.hide,
        pinned: col.hide ? null : (col.pinned || null)
      }));
      this.purchaseGridApi.applyColumnState({ state: colState, applyOrder: true });
      setTimeout(() => {
        if (this.purchaseGridApi) {
          // this.purchaseGridApi.sizeColumnsToFit();
        }
      }, 0);
    }
  }

  // Tabs Control
  activeTab: string = 'import';

  // Database Connection Status (isolated PBGM8G checking)
  dbConnected: boolean | null = null;
  dbError: string = '';

  // Dropdown Lists
  months: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  years: string[] = ['2024', '2025', '2026', '2027'];
  revisions: string[] = ['Rev.0', 'Rev.1', 'Rev.2', 'Rev.3'];

  // Custom Dropdown States
  monthDropdownOpen: boolean = false;
  yearDropdownOpen: boolean = false;
  revisionDropdownOpen: boolean = false;
  contextDropdownOpen: boolean = false;
  vendorDropdownOpen: boolean = false;

  toggleDropdown(type: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (type === 'month') {
      this.monthDropdownOpen = !this.monthDropdownOpen;
      this.yearDropdownOpen = false;
      this.revisionDropdownOpen = false;
      this.vendorDropdownOpen = false;
    } else if (type === 'year') {
      this.yearDropdownOpen = !this.yearDropdownOpen;
      this.monthDropdownOpen = false;
      this.revisionDropdownOpen = false;
      this.vendorDropdownOpen = false;
    } else if (type === 'revision') {
      this.revisionDropdownOpen = !this.revisionDropdownOpen;
      this.monthDropdownOpen = false;
      this.yearDropdownOpen = false;
      this.contextDropdownOpen = false;
      this.vendorDropdownOpen = false;
    } else if (type === 'context') {
      this.contextDropdownOpen = !this.contextDropdownOpen;
      this.monthDropdownOpen = false;
      this.yearDropdownOpen = false;
      this.revisionDropdownOpen = false;
      this.vendorDropdownOpen = false;
    } else if (type === 'vendor') {
      this.vendorDropdownOpen = !this.vendorDropdownOpen;
      this.monthDropdownOpen = false;
      this.yearDropdownOpen = false;
      this.revisionDropdownOpen = false;
      this.contextDropdownOpen = false;
    }
  }

  closeAllDropdowns() {
    this.monthDropdownOpen = false;
    this.yearDropdownOpen = false;
    this.revisionDropdownOpen = false;
    this.contextDropdownOpen = false;
    this.vendorDropdownOpen = false;
  }

  // Selected Values
  selectedMonth: string = 'January';
  selectedYear: string = '2026';
  selectedRevision: string = 'Rev.0';
  selectedFile: File | null = null;
  selectedVendor: string = 'All Vendors';
  availableVendors: string[] = [];

  onVendorSelected(vendor: string) {
    this.selectedVendor = vendor;
    this.vendorDropdownOpen = false;
    if (this.purchaseGridApi) {
      this.purchaseGridApi.onFilterChanged();
    }
  }

  // Selected Values for Planning Import
  importPlanningMonth: string = 'January';
  importPlanningYear: string = '2026';
  importPlanningRevision: string = 'Rev.0';
  selectedPlanningFile: File | null = null;

  // Grid APIs
  private forecastGridApi: any;
  private ordersGridApi: any;
  private purchaseGridApi: any;

  // --- Preview Modal State ---
  showPreviewModal: boolean = false;
  previewOrders: any[] = [];

  // --- Summary Modal State ---
  showSummaryModal: boolean = false;
  topVendors: any[] = [];
  processSummary: any[] = [];
  summaryTotalItems: number = 0;
  summaryTotalPieces: number = 0;
  summaryTotalAmount: number = 0;
  previewInventory: any[] = [];
  previewFileName: string = '';

  // --- Purchase Filter State ---
  currentPurchaseFilter: string = 'all';
  focusedPurchaseRowId: string | null = null;

  purchaseRowClassRules = {
    'row-focused-highlight': (params: any) => {
      if (!this.focusedPurchaseRowId || !params.data) return false;
      return this.getRowId(params) === this.focusedPurchaseRowId;
    },
    'row-need-order': (params: any) => params.data && (params.data.end < 0 || params.data.m1Request > 0 || params.data.m2Request > 0),
    'row-empty-stock': (params: any) => params.data && (params.data.beg === 0),
    'row-negative-balance': (params: any) => params.data && (params.data.end < 0 || params.data.m1End < 0 || params.data.m2End < 0)
  };

  forecastRowClassRules = {
    'part-group-even': (params: any) => params.data && (params.data.partGroupIndex % 2 === 0),
    'part-group-odd': (params: any) => params.data && (params.data.partGroupIndex % 2 !== 0),
    'part-block-end': (params: any) => {
      if (!params.node || params.node.rowIndex === null) return false;
      const nextRow = params.api.getDisplayedRowAtIndex(params.node.rowIndex + 1);
      return !nextRow || nextRow.data.partGroupIndex !== params.data.partGroupIndex;
    }
  };

  // --- Calculation Processing State ---
  isCalculating: boolean = false;
  calcProgress: number = 0;
  calcStatusMsg: string = '';

  // --- Result State ---
  totalAmount: number = 0;
  totalPurchaseAmount: number = 0;
  displayedPurchaseRowCount: number = 0;
  totalAlertItems: number = 0;
  isDrawerOpen: boolean = false;

  // --- Forecast Drawer State ---
  selectedForecastRowData: any = null;
  isForecastDrawerOpen: boolean = false;

  selectedTab: string = 'details';
  selectedMonthContext: string = 'm0';

  closeDrawer() { this.isDrawerOpen = false; this.selectedRowData = null; }
  closeForecastDrawer() { this.isForecastDrawerOpen = false; this.selectedForecastRowData = null; }

  onDrawerFieldChange(field: string, value: any) {
    if (!this.selectedRowData) return;
    const mockEvent = { data: this.selectedRowData, colDef: { field: field }, value: value };
    this.onPurchaseCellValueChanged(mockEvent);
  }

  getMonthName(targetMonthStr: string, offset: number): string {
    if (!targetMonthStr) return '';
    try {
      const d = new Date(targetMonthStr);
      d.setMonth(d.getMonth() + offset);
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return monthNames[d.getMonth()] + ' ' + d.getFullYear();
    } catch (e) {
      return targetMonthStr;
    }
  }

  selectTab(tab: string) { this.selectedTab = tab; }
  onRowClicked(event: any) { // Detail view disabled
  }
  onPurchaseSelectionChanged(event: any) {
    if (event && event.api) {
      event.api.refreshCells({ columns: ['selection'], force: true });
    }
  }
  onPurchaseCellClicked(event: any) {
    if (event && event.colDef && event.colDef.field) {
      if (event.colDef.field.startsWith('m1')) {
        this.selectedMonthContext = 'm1';
      } else if (event.colDef.field.startsWith('m2')) {
        this.selectedMonthContext = 'm2';
      } else {
        this.selectedMonthContext = 'm0';
      }

      if (event.colDef.field === 'deleteAction') {
        const editedItemNo = event.data._realItemNo || event.data.itemNo;

        Swal.fire({
          title: 'Confirm Delete',
          text: `Are you sure you want to remove item ${editedItemNo} from this month's order?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#dc3545',
          cancelButtonColor: '#6c757d',
          confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
          if (result.isConfirmed) {
            const key = `${String(editedItemNo).trim().toUpperCase()}_${this.targetOrderMonthOffset || 0}`;
            this.manualConfirmQtyMap[key] = 0;

            const updatedData = [...this.purchaseRowData];
            const rowIndex = updatedData.findIndex(d => String(d._realItemNo || d.itemNo).toUpperCase() === String(editedItemNo).trim().toUpperCase());
            if (rowIndex > -1) {
              const row = { ...updatedData[rowIndex] };
              const orderPlan = this.calculateOrderPlan(row);
              Object.assign(row, orderPlan);
              updatedData[rowIndex] = row;
              this.purchaseRowData = updatedData;
              if (this.purchaseGridApi) {
                if (this.purchaseViewMode === 'parameters') {
                  this.purchaseGridApi.setGridOption('rowData', updatedData);
                } else {
                  this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
                  this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
                }
                this.purchaseGridApi.onFilterChanged();
              }
            }
          }
        });
        return;
      }

      if (event.colDef.field === 'no') {
        const clickedRowId = this.getRowId(event);
        if (this.focusedPurchaseRowId === clickedRowId) {
          this.focusedPurchaseRowId = null;
          if (event.node) event.node.setSelected(false);
        } else {
          if (this.purchaseGridApi) this.purchaseGridApi.deselectAll();
          this.focusedPurchaseRowId = clickedRowId;
          if (event.node) event.node.setSelected(true);
        }
        if (this.purchaseGridApi) {
          this.purchaseGridApi.redrawRows();
        }
        return;
      }

      if (event.colDef.field === 'itemNo') {
        this.onRowClicked(event);
      } else if (event.colDef.field === 'partNo') {
        this.openPartNoPopup(event.data);
      } else if (event.colDef.field === 'selection') {
        if (event.node.isSelected()) {
          event.node.setSelected(false);
        } else {
          event.node.setSelected(true);
        }
      }
    }
  }

  onForecastCellClicked(event: any) {
    if (event && event.colDef && (event.colDef.headerName === 'Part No' || event.colDef.field === 'partNo')) {
      this.openPartNoPopup(event.data);
    }
  }

  setPurchaseFilter(filter: string) {
    this.currentPurchaseFilter = filter;
    if (this.purchaseGridApi) {
      this.purchaseGridApi.onFilterChanged();
    }
  }

  recalculateTotals() {
    if (!this.purchaseGridApi) return;
    let total = 0;
    let count = 0;
    this.purchaseGridApi.forEachNodeAfterFilter((node: any) => {
      if (node.data) {
        total += (node.data.amount || 0);
        count++;
      }
    });
    this.totalPurchaseAmount = total;
    this.displayedPurchaseRowCount = count;
    this.cdr.detectChanges();
  }

  isExternalFilterPresent = (): boolean => {
    return this.currentPurchaseFilter !== 'all' || this.selectedVendor !== 'All Vendors' || this.purchaseViewMode === 'vendor';
  };

  doesExternalFilterPass = (node: any): boolean => {
    if (this.selectedVendor !== 'All Vendors') {
      if (node.data.vendorName !== this.selectedVendor) {
        return false;
      }
    }

    if (this.purchaseViewMode === 'vendor') {
      const explicitZero = node.data.confirmQty !== null && node.data.confirmQty !== undefined && node.data.confirmQty !== '' && Number(node.data.confirmQty) === 0;
      if (explicitZero) return false;

      const hasSuggestQty = node.data.suggestOrderQty !== null && Number(node.data.suggestOrderQty) > 0;
      const hasConfirmQty = node.data.confirmQty !== null && node.data.confirmQty !== '' && Number(node.data.confirmQty) > 0;
      if (!hasSuggestQty && !hasConfirmQty) {
        return false;
      }
    }

    if (this.currentPurchaseFilter === 'need_order') {
      // Shortage is detected if End Balance of ANY month goes below zero.
      return node.data.end < 0 || node.data.m1End < 0 || node.data.m2End < 0 || node.data.m3End < 0 || node.data.m4End < 0 || node.data.m5End < 0;
    } else if (this.currentPurchaseFilter === 'empty_stock') {
      return node.data.beg === 0;
    }
    return true;
  };

  getMonthLabel(offset: number): string {
    if (!this.selectedYear || !this.selectedMonth) return '';
    const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const sMonthInt = monthNamesFull.indexOf(this.selectedMonth);
    if (sMonthInt === -1) return '';
    const d = new Date(Number(this.selectedYear), sMonthInt + offset, 1);
    const shortNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return shortNames[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2);
  }

  getMonthNameForContext(context: 'm0' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5'): string {
    if (!this.selectedYear || !this.selectedMonth) return '';
    const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const sMonthInt = monthNamesFull.indexOf(this.selectedMonth);
    if (sMonthInt === -1) return '';

    let offset = 0;
    if (context === 'm1') offset = 1;
    else if (context === 'm2') offset = 2;
    else if (context === 'm3') offset = 3;
    else if (context === 'm4') offset = 4;
    else if (context === 'm5') offset = 5;

    const d = new Date(Number(this.selectedYear), sMonthInt + offset, 1);
    const shortNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return shortNames[d.getMonth()] + ' ' + d.getFullYear();
  }

  get displayedMonthContext(): string {
    return this.getMonthNameForContext(this.selectedMonthContext as any);
  }

  getCurrentContextValue(baseField: string): number {
    if (!this.selectedRowData) return 0;
    if (this.selectedMonthContext === 'm0') return this.selectedRowData[baseField] || 0;

    // For specific fields where m0 doesn't match the base name exactly
    let resolvedBaseField = baseField;
    if (baseField === 'forecastPd' && this.selectedMonthContext !== 'm0') {
      resolvedBaseField = 'forecast';
    } else if (baseField === 'pr' && this.selectedMonthContext !== 'm0') {
      resolvedBaseField = 'request';
    } else if (baseField === 'in' && this.selectedMonthContext !== 'm0') {
      resolvedBaseField = 'po';
    }

    const capitalizedField = resolvedBaseField.charAt(0).toUpperCase() + resolvedBaseField.slice(1);
    const contextualField = this.selectedMonthContext + capitalizedField;

    return this.selectedRowData[contextualField] || 0;
  }

  getArrivalDate(ltDays: number): string {
    if (!ltDays) return '-';
    const d = new Date();
    d.setDate(d.getDate() + ltDays);
    const shortNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return shortNames[d.getMonth()] + ' ' + d.getFullYear();
  }
  bufferOptions: number[] = [25, 50, 75, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
  ltOptions: number[] = [30, 45, 60, 75, 90, 105, 120];
  private pendingForecastData: any[] | null = null;  // buffer for timing issue

  currentUser: any = {};

  // Grid Row Data
  forecastRowData: any[] = [];
  ordersRowData: any[] = [];
  purchaseRowData: any[] = [];

  // Live DB Autoload State
  isLiveAutoloadActive: boolean = true;
  lastDbLoadedAt: string = '';
  lastDbExpenseId: number | null = null;
  lastDbInventoryId: number | null = null;
  lastDbStockSummaryId: number | null = null;
  lastDbStockSummaryLoadedAt: string = '';
  lastDbCuttingtoolsInvId: number | null = null;
  lastDbCuttingtoolsInvLoadedAt: string = '';
  isSyncingIssue: boolean = false;
  lastSyncTime: Date | null = null;
  private autoloadSub: Subscription | null = null;
  private autoloadIntervalTimer: any = null;

  constructor(
    private masterPHService: MasterPHService,
    private forecastService: ForecastService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  columnTypes: { [key: string]: any } = {
    customNumericColumn: {
      cellClass: 'ag-right-aligned-cell',
      headerClass: 'ag-right-aligned-header'
    }
  };

  ngOnInit() {
    this.loadUserSession();
    this.checkDbConnection();
    this.updateTargetMonthOptions();
    this.applyCellClassRulesToCols(this.purchaseColDefs);
    this.applyViewModeColumns();
    this.initAutoloadWatcher();
  }

  ngOnDestroy() {
    if (this.autoloadSub) {
      this.autoloadSub.unsubscribe();
      this.autoloadSub = null;
    }
    if (this.autoloadIntervalTimer) {
      clearInterval(this.autoloadIntervalTimer);
      this.autoloadIntervalTimer = null;
    }
  }

  initAutoloadWatcher() {
    // 1. Initial snapshot check
    this.forecastService.getAutoloadStatus().pipe(catchError(() => of(null))).subscribe((status) => {
      if (status && status.expense) {
        this.lastDbLoadedAt = status.expense.loaded_at || '';
        this.lastDbExpenseId = status.expense.id || null;
        this.lastDbInventoryId = status.inventory ? status.inventory.id : null;
        this.lastDbStockSummaryId = status.stockSummary ? status.stockSummary.id : null;
        this.lastDbStockSummaryLoadedAt = status.stockSummary ? status.stockSummary.loaded_at : '';
        this.lastDbCuttingtoolsInvId = status.cuttingtoolsInventory ? status.cuttingtoolsInventory.id : null;
        this.lastDbCuttingtoolsInvLoadedAt = status.cuttingtoolsInventory ? status.cuttingtoolsInventory.loaded_at : '';
        this.lastSyncTime = new Date();
        this.cdr.detectChanges();
      }
    });

    // 2. Real-time WebSocket listener via NotificationService
    this.autoloadSub = this.notificationService.forecastAutoload$.subscribe((event: any) => {
      if (!event) return;
      console.log('[Forecast Dashboard] Autoload event received:', event);

      if (event.table === 'expense_daily') {
        this.lastDbLoadedAt = event.loaded_at || this.lastDbLoadedAt;
        this.lastDbExpenseId = event.id || this.lastDbExpenseId;
        this.autoSyncDailyIssue(true);
      } else if (event.table === 'inventory_daily') {
        this.lastDbInventoryId = event.id || this.lastDbInventoryId;
        this.autoSyncInventory(true);
      } else if (event.table === 'cuttingtools_stock_summary_daily') {
        this.lastDbStockSummaryId = event.id || this.lastDbStockSummaryId;
        this.lastDbStockSummaryLoadedAt = event.loaded_at || this.lastDbStockSummaryLoadedAt;
        this.autoSyncCuttingToolsStockSummary(true);
      } else if (event.table === 'cuttingtools_inventory_daily') {
        this.lastDbCuttingtoolsInvId = event.id || this.lastDbCuttingtoolsInvId;
        this.lastDbCuttingtoolsInvLoadedAt = event.loaded_at || this.lastDbCuttingtoolsInvLoadedAt;
        this.autoSyncCuttingToolsInventory(true);
      }
    });

    // 3. Fallback polling check every 20 seconds
    this.autoloadIntervalTimer = setInterval(() => {
      if (document.hidden) return; // Skip if tab is inactive
      this.checkAutoloadStatusSilent();
    }, 20000);
  }

  checkAutoloadStatusSilent() {
    this.forecastService.getAutoloadStatus().pipe(catchError(() => of(null))).subscribe((status) => {
      if (!status) return;

      if (status.expense && status.expense.loaded_at) {
        const isExpenseNew = this.lastDbExpenseId !== null && (status.expense.id !== this.lastDbExpenseId || status.expense.loaded_at !== this.lastDbLoadedAt);
        this.lastDbLoadedAt = status.expense.loaded_at;
        this.lastDbExpenseId = status.expense.id;

        if (isExpenseNew) {
          console.log('[Forecast Dashboard] Fallback detected new expense autoload:', status.expense);
          this.autoSyncDailyIssue(true);
        }
      }

      if (status.inventory && status.inventory.id) {
        const isInvNew = this.lastDbInventoryId !== null && status.inventory.id !== this.lastDbInventoryId;
        this.lastDbInventoryId = status.inventory.id;

        if (isInvNew) {
          console.log('[Forecast Dashboard] Fallback detected new inventory autoload:', status.inventory);
          this.autoSyncInventory(true);
        }
      }

      if (status.stockSummary && status.stockSummary.id) {
        const isStockSummaryNew = this.lastDbStockSummaryId !== null && (status.stockSummary.id !== this.lastDbStockSummaryId || status.stockSummary.loaded_at !== this.lastDbStockSummaryLoadedAt);
        this.lastDbStockSummaryId = status.stockSummary.id;
        this.lastDbStockSummaryLoadedAt = status.stockSummary.loaded_at;

        if (isStockSummaryNew) {
          console.log('[Forecast Dashboard] Fallback detected new cuttingtools stock summary:', status.stockSummary);
          this.autoSyncCuttingToolsStockSummary(true);
        }
      }

      if (status.cuttingtoolsInventory && status.cuttingtoolsInventory.id) {
        const isCuttingtoolsInvNew = this.lastDbCuttingtoolsInvId !== null && (status.cuttingtoolsInventory.id !== this.lastDbCuttingtoolsInvId || status.cuttingtoolsInventory.loaded_at !== this.lastDbCuttingtoolsInvLoadedAt);
        this.lastDbCuttingtoolsInvId = status.cuttingtoolsInventory.id;
        this.lastDbCuttingtoolsInvLoadedAt = status.cuttingtoolsInventory.loaded_at;

        if (isCuttingtoolsInvNew) {
          console.log('[Forecast Dashboard] Fallback detected new cuttingtools inventory daily:', status.cuttingtoolsInventory);
          this.autoSyncCuttingToolsInventory(true);
        }
      }
      this.cdr.detectChanges();
    });
  }

  autoSyncDailyIssue(notify = true) {
    if (this.isSyncingIssue || !this.purchaseRowData || this.purchaseRowData.length === 0) return;
    this.isSyncingIssue = true;
    this.cdr.detectChanges();

    this.forecastService.getDailyIssue(this.selectedYear, this.selectedMonth).pipe(
      catchError(() => of([]))
    ).subscribe({
      next: (dailyIssueData) => {
        const dailyIssueMap = new Map<string, number>();
        const dailyIssueDateMap = new Map<string, string>();
        (dailyIssueData || []).forEach((d: any) => {
          const item = String(d.item_no || d.ItemNo || '').trim().toUpperCase();
          if (item) {
            dailyIssueMap.set(item, Number(d.issue_qty || d.quantity || 0));
            const rawDate = d.download_date || d.issue_date || d.date_downloaded || d.last_trans_date;
            if (rawDate) {
              let formatted = String(rawDate).trim();
              if (formatted.includes('-')) {
                const parts = formatted.split('-');
                if (parts.length === 3 && parts[0].length === 4) {
                  formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
              }
              dailyIssueDateMap.set(item, formatted);
            }
          }
        });

        let changedCount = 0;
        const updatedRows: any[] = [];

        this.purchaseRowData.forEach((row: any) => {
          const itemKey = String(row._realItemNo || row.itemNo || '').trim().toUpperCase();
          const newIssue = dailyIssueMap.get(itemKey) || 0;
          const newDate = newIssue > 0 ? (dailyIssueDateMap.get(itemKey) || '-') : '-';
          if (row.issue !== newIssue || row.issueDate !== newDate) {
            let targetDailyForecast = row.planSetup;
            let targetPo = row.in;
            let targetPr = row.pr;
            if (this.selectedDailyForecastMonthOffset === 1) {
              targetDailyForecast = row.issM1;
              targetPo = row.m1Po;
              targetPr = row.m1Request;
            } else if (this.selectedDailyForecastMonthOffset === 2) {
              targetDailyForecast = row.issM2;
              targetPo = row.m2Po;
              targetPr = row.m2Request;
            } else if (this.selectedDailyForecastMonthOffset === 3) {
              targetDailyForecast = row.issM3;
              targetPo = row.m3Po;
              targetPr = row.m3Request;
            } else if (this.selectedDailyForecastMonthOffset === 4) {
              targetDailyForecast = row.issM4;
              targetPo = row.m4Po;
              targetPr = row.m4Request;
            } else if (this.selectedDailyForecastMonthOffset === 5) {
              targetDailyForecast = row.issM5;
              targetPo = row.m5Po;
              targetPr = row.m5Request;
            }

            row.dailyTotalSupply = (row.stockOnHand || 0) + (Number(targetPo) || 0) + (Number(targetPr) || 0);
            row.issue = newIssue;
            row.balanceIssue = (targetDailyForecast || 0) - newIssue;
            row.blUseMonth = row.dailyTotalSupply - row.balanceIssue;
            row.issueDate = newDate;
            updatedRows.push(row);
            changedCount++;
          }
        });

        if (this.purchaseGridApi && updatedRows.length > 0) {
          if (this.purchaseViewMode !== 'parameters') {
            this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
            this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
          }
          this.purchaseGridApi.refreshCells({
            columns: ['issue', 'dailyTotalSupply', 'balanceIssue', 'blUseMonth', 'issueDate'],
            force: true
          });
          this.recalculateTotals();
        }

        this.lastSyncTime = new Date();
        this.isSyncingIssue = false;
        this.cdr.detectChanges();

        if (notify && changedCount > 0) {
          Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true
          }).fire({
            icon: 'success',
            title: `🔄 อัพเดตข้อมูล Issue อัตโนมัติ (${changedCount} รายการ)`,
            text: `DB Batch: ${this.lastDbLoadedAt}`
          });
        }
      },
      error: () => {
        this.isSyncingIssue = false;
        this.cdr.detectChanges();
      }
    });
  }

  autoSyncInventory(notify = true) {
    if (!this.purchaseRowData || this.purchaseRowData.length === 0) return;
    this.forecastService.getStockOnRack().pipe(catchError(() => of([]))).subscribe({
      next: (stockData) => {
        const stockMap = new Map<string, any>();
        (stockData || []).forEach((s: any) => {
          const sItem = String(s.itemNo || s.ItemNo || '').trim().toUpperCase();
          if (sItem) stockMap.set(sItem, s);
        });

        let changedCount = 0;
        const updatedRows: any[] = [];
        this.purchaseRowData.forEach((row: any) => {
          const itemKey = String(row._realItemNo || row.itemNo || '').trim().toUpperCase();
          const stockInfo = stockMap.get(itemKey);
          if (stockInfo) {
            const stkPd = Number(stockInfo.stkPd) || 0;
            const stkPh = Number(stockInfo.stkPh) || 0;
            const currentStock = stkPd + stkPh;
            if (row.stkPd !== stkPd || row.stkPh !== stkPh || row.stockOnHand !== currentStock) {
              row.stkPd = stkPd;
              row.stkPh = stkPh;
              row.currentStock = currentStock;
              row.stockOnHand = currentStock;
              row.beg = currentStock;

              let targetPo = row.in;
              let targetPr = row.pr;
              if (this.selectedDailyForecastMonthOffset === 1) { targetPo = row.m1Po; targetPr = row.m1Request; }
              else if (this.selectedDailyForecastMonthOffset === 2) { targetPo = row.m2Po; targetPr = row.m2Request; }
              else if (this.selectedDailyForecastMonthOffset === 3) { targetPo = row.m3Po; targetPr = row.m3Request; }
              else if (this.selectedDailyForecastMonthOffset === 4) { targetPo = row.m4Po; targetPr = row.m4Request; }
              else if (this.selectedDailyForecastMonthOffset === 5) { targetPo = row.m5Po; targetPr = row.m5Request; }

              row.dailyTotalSupply = currentStock + (Number(targetPo) || 0) + (Number(targetPr) || 0);
              row.blUseMonth = row.dailyTotalSupply - (row.balanceIssue || 0);
              updatedRows.push(row);
              changedCount++;
            }
          }
        });

        if (this.purchaseGridApi && updatedRows.length > 0) {
          if (this.purchaseViewMode !== 'parameters') {
            this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
            this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
          }
          this.purchaseGridApi.refreshCells({
            columns: ['stkPd', 'stkPh', 'inventoryPh', 'beg', 'stockOnHand', 'dailyTotalSupply', 'blUseMonth'],
            force: true
          });
          this.recalculateTotals();
        }
        this.cdr.detectChanges();
      }
    });
  }

  manualSyncAutoload() {
    this.isSyncingIssue = true;
    this.cdr.detectChanges();
    this.forecastService.getAutoloadStatus().pipe(catchError(() => of(null))).subscribe((status) => {
      if (status && status.expense) {
        this.lastDbLoadedAt = status.expense.loaded_at || this.lastDbLoadedAt;
        this.lastDbExpenseId = status.expense.id;
      }
      if (status && status.stockSummary) {
        this.lastDbStockSummaryId = status.stockSummary.id;
        this.lastDbStockSummaryLoadedAt = status.stockSummary.loaded_at;
      }
      if (status && status.cuttingtoolsInventory) {
        this.lastDbCuttingtoolsInvId = status.cuttingtoolsInventory.id;
        this.lastDbCuttingtoolsInvLoadedAt = status.cuttingtoolsInventory.loaded_at;
      }
      this.autoSyncDailyIssue(true);
      this.autoSyncInventory(false);
      this.autoSyncCuttingToolsStockSummary(false);
      this.autoSyncCuttingToolsInventory(false);
    });
  }

  autoSyncCuttingToolsStockSummary(notify = true) {
    if (!this.purchaseRowData || this.purchaseRowData.length === 0) return;
    this.forecastService.getCuttingToolsStockSummary(this.selectedYear, this.selectedMonth).pipe(
      catchError(() => of([]))
    ).subscribe({
      next: (stockSummaryData) => {
        const stockSummaryMap = new Map<string, any>();
        (stockSummaryData || []).forEach((s: any) => {
          const item = String(s.item_no || s.ItemNo || '').trim().toUpperCase();
          if (item) stockSummaryMap.set(item, s);
        });

        let changedCount = 0;
        const updatedRows: any[] = [];
        this.purchaseRowData.forEach((row: any) => {
          const itemKey = String(row._realItemNo || row.itemNo || '').trim().toUpperCase();
          const sInfo = stockSummaryMap.get(itemKey);
          if (sInfo) {
            const newBeginningQty = Number(sInfo.beginning_qty) || 0;
            const newReceivedQty = Number(sInfo.received_qty) || 0;
            let hasChange = false;
            if (row.inventoryPh !== newBeginningQty) {
              row.inventoryPh = newBeginningQty;
              row.sumInventory = (Number(row.inventoryPd) || 0) + newBeginningQty;
              hasChange = true;
            }
            if (row.receive !== newReceivedQty) {
              row.receive = newReceivedQty;
              hasChange = true;
            }
            if (hasChange) {
              updatedRows.push(row);
              changedCount++;
            }
          }
        });

        if (this.purchaseGridApi && updatedRows.length > 0) {
          if (this.purchaseViewMode !== 'parameters') {
            this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
            this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
          }
          this.purchaseGridApi.refreshCells({
            columns: ['inventoryPh', 'sumInventory', 'receive', 'totalSupply', 'end', 'm1Beg', 'm1End', 'm2Beg', 'm2End', 'm3Beg', 'm3End', 'm4Beg', 'm4End', 'm5Beg', 'm5End'],
            force: true
          });
          this.recalculateTotals();
        }
        this.lastSyncTime = new Date();
        this.cdr.detectChanges();

        if (notify && changedCount > 0) {
          Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true
          }).fire({
            icon: 'success',
            title: `🔄 อัพเดตข้อมูล Inventory PH อัตโนมัติ (${changedCount} รายการ)`
          });
        }
      }
    });
  }

  autoSyncCuttingToolsInventory(notify = true) {
    if (!this.purchaseRowData || this.purchaseRowData.length === 0) return;
    this.forecastService.getCuttingToolsInventoryDaily(this.selectedYear, this.selectedMonth).pipe(
      catchError(() => of([]))
    ).subscribe({
      next: (invData) => {
        const invMap = new Map<string, any>();
        (invData || []).forEach((d: any) => {
          const item = String(d.item_no || d.tooling_name || '').trim().toUpperCase();
          if (item) invMap.set(item, d);
        });

        let changedCount = 0;
        const updatedRows: any[] = [];
        this.purchaseRowData.forEach((row: any) => {
          const itemKey = String(row._realItemNo || row.itemNo || '').trim().toUpperCase();
          const invInfo = invMap.get(itemKey);
          const newToolingQty = invInfo ? (Number(invInfo.tooling_qty) || 0) : 0;
          if (row.inventoryPd !== newToolingQty) {
            row.inventoryPd = newToolingQty;
            row.sumInventory = newToolingQty + (Number(row.inventoryPh) || 0);
            updatedRows.push(row);
            changedCount++;
          }
        });

        if (this.purchaseGridApi && updatedRows.length > 0) {
          if (this.purchaseViewMode !== 'parameters') {
            this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
            this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
          }
          this.purchaseGridApi.refreshCells({
            columns: ['inventoryPd', 'sumInventory', 'totalSupply', 'end', 'm1Beg', 'm1End', 'm2Beg', 'm2End', 'm3Beg', 'm3End', 'm4Beg', 'm4End', 'm5Beg', 'm5End'],
            force: true
          });
          this.recalculateTotals();
        }
        this.lastSyncTime = new Date();
        this.cdr.detectChanges();

        if (notify && changedCount > 0) {
          Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true
          }).fire({
            icon: 'success',
            title: `🔄 อัพเดตข้อมูล Inventory PD อัตโนมัติ (${changedCount} รายการ)`
          });
        }
      }
    });
  }

  applyCellClassRulesToCols(cols: any[]) {
    cols.forEach(col => {
      if (col.children) {
        this.applyCellClassRulesToCols(col.children);
      } else {
        if (!col.cellClassRules) col.cellClassRules = {};
        const isShortage = (d: any) => d && (d.end < 0 || d.m1End < 0 || d.m2End < 0 || d.m3End < 0 || d.m4End < 0 || d.m5End < 0);
        col.cellClassRules['cell-need-order'] = (params: any) => isShortage(params.data);
        col.cellClassRules['cell-empty-stock'] = (params: any) => params.data && params.data.beg === 0 && !isShortage(params.data);
      }
    });
  }

  loadUserSession() {
    try {
      const userSession = sessionStorage.getItem('user');
      if (userSession) {
        this.currentUser = JSON.parse(userSession);
      }
    } catch (e) {
      console.error('Error parsing user session:', e);
    }
  }

  get isPurchaseOrAdmin(): boolean {
    const role = (this.currentUser?.Role || '').toLowerCase();
    return role === 'purchase' || role === 'admin' || role === 'ph';
  }

  checkDbConnection() {
    this.dbConnected = null;
    this.dbError = '';
    this.forecastService.getConnectionStatus().subscribe({
      next: (status) => {
        this.dbConnected = status.connected;
        if (!status.connected) {
          this.dbError = status.error || 'Unable to connect to PBGM8G server';
        }
      },
      error: (err) => {
        this.dbConnected = false;
        this.dbError = err.error?.error || err.message || 'Network error querying database status';
      }
    });
  }

  // Default Grid Options (Force all grids to be fully editable)
  defaultColDef: ColDef = {
    resizable: true,
    editable: false,
    sortable: true,
    filter: true,
    cellClassRules: {
      'cell-focused-highlight': (p: any) => Boolean(this.focusedPurchaseRowId && p.data && this.getRowId(p) === this.focusedPurchaseRowId)
    }
  };

  // Helper for Option 2 & 3: Suppress duplicate values in grouped Part blocks
  suppressDuplicatePart = (p: any) => {
    if (p.value == null) return '-';
    if (p.node && p.node.rowIndex > 0) {
      const prevRow = p.api.getDisplayedRowAtIndex(p.node.rowIndex - 1);
      if (prevRow && prevRow.data && prevRow.data.partNo === p.data.partNo) {
        return '';
      }
    }
    return p.value;
  };

  // Grid Column Definitions
  forecastColDefs: any[] = [
    { field: 'no', headerName: 'No.', width: 65, editable: false, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      valueGetter: 'node.rowIndex + 1',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-center h-100"><span class="text-muted fw-bold small">${p.value}</span></div>`
    },
    { field: 'partNo', headerName: 'Part No', width: 200, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      tooltipValueGetter: (p: any) => p.value,
      cellRenderer: (p: any) => {
        const brokenBadge = (p.data?.isBroken100 || p.data?.brokenRate === 100)
          ? `<span class="badge bg-danger text-white rounded-pill ms-1 px-1.5 py-0 shadow-sm" style="font-size: 0.68rem;" title="Warning: มีประวัติเบิกใช้เป็นสถานะ Broken 100% (คำนวณอิงตาม Engineer Usage)"><i class="bi bi-exclamation-octagon-fill me-1"></i>Broken 100%</span>`
          : (p.data?.brokenAlert
              ? `<span class="badge bg-warning text-dark rounded-pill ms-1 px-1.5 py-0 shadow-sm" style="font-size: 0.68rem;" title="Warning: มีประวัติแตกหัก (Broken) สูง ${p.data.brokenRate}%"><i class="bi bi-exclamation-triangle-fill me-1"></i>Broken ${p.data.brokenRate}%</span>`
              : '');
        return `<div class="d-flex align-items-center h-100" style="cursor: pointer;">
                  <div class="icon-box-small me-2"><i class="bi bi-box-seam text-primary"></i></div>
                  <span class="fw-bold text-primary text-decoration-underline" style="letter-spacing: 0.5px;">${p.value || '-'}</span>
                  ${brokenBadge}
                </div>`;
      }
    },
    { field: 'itemNo', headerName: 'Item No', width: 150, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      filter: 'agTextColumnFilter', filterParams: { filterOptions: ['equals', 'contains', 'notEqual', 'startsWith', 'endsWith'], defaultOption: 'equals' },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="text-muted small">${p.value || '-'}</span></div>`
    },
    { field: 'position', headerName: 'Position', width: 100, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 rounded-pill px-2 py-1">${p.value || '-'}</span></div>`
    },
    { field: 'process', headerName: 'Process', width: 120, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      cellRenderer: (p: any) => {
        const rowIndex = p.node?.rowIndex;
        if (rowIndex != null && rowIndex > 0 && p.api) {
           const prevNode = p.api.getDisplayedRowAtIndex(rowIndex - 1);
           if (prevNode && prevNode.data && prevNode.data.partNo === p.data.partNo && prevNode.data.targetMonth === p.data.targetMonth && prevNode.data.process === p.data.process) {}
        }
        return `<div class="d-flex align-items-center h-100"><span class="badge bg-light text-secondary border px-2 py-1 rounded-3"><i class="bi bi-gear-fill me-1 text-muted"></i>${p.value || '-'}</span></div>`;
      }
    },
    { field: 'mc', headerName: 'MC Type', width: 140, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      cellRenderer: (p: any) => {
        const rowIndex = p.node?.rowIndex;
        if (rowIndex != null && rowIndex > 0 && p.api) {
           const prevNode = p.api.getDisplayedRowAtIndex(rowIndex - 1);
           if (prevNode && prevNode.data && prevNode.data.partNo === p.data.partNo && prevNode.data.targetMonth === p.data.targetMonth && prevNode.data.process === p.data.process && prevNode.data.mc === p.data.mc) {}
        }
        return `<div class="d-flex align-items-center h-100"><span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill px-3 py-1"><i class="bi bi-gear-fill me-1 small"></i> ${p.value || '-'}</span></div>`;
      }
    },
    { field: 'targetMonth', headerName: 'Target Month', width: 140, headerClass: 'header-params',
      cellRenderer: (p: any) => {
        const rowIndex = p.node?.rowIndex;
        if (rowIndex != null && rowIndex > 0 && p.api) {
           const prevNode = p.api.getDisplayedRowAtIndex(rowIndex - 1);
           if (prevNode && prevNode.data && prevNode.data.partNo === p.data.partNo && prevNode.data.targetMonth === p.data.targetMonth) {}
        }
        return `<div class="d-flex align-items-center h-100"><span class="text-muted fw-semibold font-monospace small">${p.value || '-'}</span></div>`;
      }
    },
    { field: 'partQty', headerName: 'Part Qty', type: 'numericColumn', width: 130, headerClass: 'header-params ag-right-aligned-header',
      cellRenderer: (p: any) => {
        const rowIndex = p.node?.rowIndex;
        if (rowIndex != null && rowIndex > 0 && p.api) {
           const prevNode = p.api.getDisplayedRowAtIndex(rowIndex - 1);
           if (prevNode && prevNode.data && prevNode.data.partNo === p.data.partNo && prevNode.data.targetMonth === p.data.targetMonth && prevNode.data.process === p.data.process && prevNode.data.mc === p.data.mc) {}
        }
        return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? p.value.toLocaleString() : '-'}</span></div>`;
      }
    },
    { field: 'mcQty', headerName: 'MC Qty', type: 'numericColumn', width: 110, headerClass: 'header-params ag-right-aligned-header',
      cellRenderer: (p: any) => {
        const rowIndex = p.node?.rowIndex;
        if (rowIndex != null && rowIndex > 0 && p.api) {
           const prevNode = p.api.getDisplayedRowAtIndex(rowIndex - 1);
           if (prevNode && prevNode.data && prevNode.data.partNo === p.data.partNo && prevNode.data.targetMonth === p.data.targetMonth && prevNode.data.process === p.data.process && prevNode.data.mc === p.data.mc) {}
        }
        return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-teal-700">${p.value != null ? p.value.toLocaleString() : '-'}</span></div>`;
      }
    },
    { field: 'initialItemQty', headerName: 'Tool Use / Pos', type: 'numericColumn', width: 150, headerClass: 'header-params ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="text-secondary fw-semibold">${p.value != null ? p.value.toLocaleString() : '-'}</span></div>`
    },
    { field: 'usagePcs', headerName: 'Engineer Usage', type: 'numericColumn', width: 170, headerClass: 'header-params ag-right-aligned-header',
        cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="text-secondary fw-semibold">${p.value != null ? p.value.toLocaleString() : '-'}</span></div>`
      },
      { field: 'reqQty', headerName: 'Item Qty (Adjusted)', type: 'numericColumn', width: 170, headerClass: 'header-params ag-right-aligned-header',
      cellRenderer: (p: any) => {
        if (p.value > (p.data?.initialItemQty ?? p.value)) {
          return `<div class="d-flex align-items-center justify-content-end h-100"><span class="badge bg-warning text-dark px-3 py-2 fs-6 shadow-sm border border-warning">${p.value != null ? p.value.toLocaleString() : '-'}</span></div>`;
        }
        return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${p.value != null ? p.value.toLocaleString() : '-'}</span></div>`;
      }
    },
    { field: 'unitPrice', headerName: 'Unit Price (฿)', type: 'numericColumn', width: 140, headerClass: 'header-params ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="text-secondary fw-semibold">฿${p.value != null ? p.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</span></div>`
    },
    { field: 'amount', headerName: 'Amount (฿)', type: 'numericColumn', flex: 1, minWidth: 150, headerClass: 'header-params ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-primary">฿${p.value != null ? p.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0'}</span></div>`
    }
  ];

  purchaseColDefs: any[] = [
    { field: 'selection', headerName: '', width: 50, pinned: 'left', lockPosition: 'left', lockPinned: true, hide: true, headerComponent: CustomHeaderCheckbox, cellRenderer: (p: any) => { const isChecked = p.node.isSelected(); return `<div class="d-flex align-items-center justify-content-center h-100 w-100"><label class="ui-cb-container" onclick="event.preventDefault();"><input type="checkbox" ${isChecked ? 'checked' : ''} /><div class="ui-checkmark"></div></label></div>`; } },
    { field: 'no', headerName: 'NO', width: 70, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      valueGetter: 'node.rowIndex + 1',
      cellRenderer: (p: any) => {
        const rowId = p.data ? this.getRowId(p) : null;
        const isFocused = Boolean(this.focusedPurchaseRowId && rowId === this.focusedPurchaseRowId);
        return `<div class="d-flex align-items-center justify-content-center h-100" style="cursor: pointer;" title="${isFocused ? 'คลิกเพื่อยกเลิกโฟกัสแถวนี้' : 'คลิกเพื่อโฟกัสแถวนี้'}">
          <span class="${isFocused ? 'badge bg-primary text-white rounded-pill px-2.5 py-1 shadow-sm' : 'text-muted fw-bold small no-cell-num'}">${p.value}</span>
        </div>`;
      }
    },
    { field: 'itemNo', headerName: 'Item No', width: 140, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      filter: 'agTextColumnFilter', filterParams: { filterOptions: ['equals', 'contains', 'notEqual', 'startsWith', 'endsWith'], defaultOption: 'equals' },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100" ><div class="icon-box-small me-2"><i class="bi bi-box-seam text-primary"></i></div><span class="fw-bold text-primary ">${p.value}</span></div>`
    },
    { field: 'name',   headerName: 'Name',    width: 200, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="text-secondary fw-medium" style="font-size: 0.82rem;">${p.value}</span></div>`
    },
    { field: 'spec',   headerName: 'Spec',    width: 140, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="text-muted small">${p.value || '-'}</span></div>`
    },
    { field: 'partNo', headerName: 'Part No', width: 220, minWidth: 120, resizable: true, headerClass: 'header-params', pinned: 'left', lockPosition: 'left', lockPinned: true,
      tooltipValueGetter: (p: any) => {
        if (!p.data) return p.value || '';
        const all = p.data.allPartNosString || (p.data.allPartNos && p.data.allPartNos.length > 0 ? p.data.allPartNos.join(', ') : p.value);
        const count = p.data.allPartNos?.length || p.data.partUsageDetailsArray?.length || (p.value && p.value !== '-' ? 1 : 0);
        return `Part No ทั้งหมด (${count} รายการ):\n${all || '-'}\n(คลิกเพื่อดูรายละเอียดแบบขยาย)`;
      },
      cellRenderer: (p: any) => {
        if (!p.value || p.value === '-') return `<div class="d-flex align-items-center h-100 text-muted">-</div>`;
        const count = p.data?.allPartNos?.length || p.data?.partUsageDetailsArray?.length || 0;
        const moreBadge = count > 1 ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill ms-1 px-1.5 py-0" style="font-size: 0.68rem;" title="มีทั้งหมด ${count} Part No">+${count - 1}</span>` : '';
        const brokenBadge = (p.data?.isBroken100 || p.data?.brokenRate === 100)
          ? `<span class="badge bg-danger text-white rounded-pill ms-1 px-1.5 py-0 shadow-sm" style="font-size: 0.68rem;" title="Warning: มีประวัติเบิกใช้เป็นสถานะ Broken 100% (คำนวณอิงตาม Engineer Usage)"><i class="bi bi-exclamation-octagon-fill me-1"></i>Broken 100%</span>`
          : (p.data?.brokenAlert
              ? `<span class="badge bg-warning text-dark rounded-pill ms-1 px-1.5 py-0 shadow-sm" style="font-size: 0.68rem;" title="Warning: มีประวัติแตกหัก (Broken) สูง ${p.data.brokenRate}%"><i class="bi bi-exclamation-triangle-fill me-1"></i>Broken ${p.data.brokenRate}%</span>`
              : '');
        return `<div class="d-flex align-items-center justify-content-between h-100 w-100" style="cursor: pointer;" title="คลิกเพื่อขยายดู Part No ทั้งหมด">
                  <div class="d-flex align-items-center text-truncate">
                    <span class="fw-bold text-primary text-truncate" style="letter-spacing: 0.3px;">${p.value}</span>
                    ${brokenBadge}
                  </div>
                  <div class="d-flex align-items-center flex-shrink-0 ms-1">
                    ${moreBadge}
                    <i class="bi bi-arrows-angle-expand text-muted ms-1 opacity-50" style="font-size: 0.72rem;"></i>
                  </div>
                </div>`;
      },
      onCellClicked: (params: any) => {
        this.openPartNoPopup(params.data);
      }
    },
    { field: 'process', headerName: 'Process', width: 125, resizable: true, headerClass: 'header-params',
      filter: 'agTextColumnFilter',
      tooltipValueGetter: (p: any) => p.value || '-',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="badge bg-light text-secondary border px-2 py-1 rounded-3"><i class="bi bi-gear-fill me-1 text-muted"></i>${p.value || '-'}</span></div>`
    },
    { field: 'position', headerName: 'Position', width: 130, resizable: true, headerClass: 'header-params',
      filter: 'agTextColumnFilter',
      tooltipValueGetter: (p: any) => p.value || '-',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="badge bg-light text-primary border px-2 py-1 rounded-3 font-monospace">${p.value || '-'}</span></div>`
    },
    { field: 'targetMonth', headerName: 'YYYY-MM', width: 110, headerClass: 'header-params group-divider', cellClass: 'group-divider', pinned: 'left', lockPosition: 'left', lockPinned: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="text-muted fw-semibold font-monospace small">${p.value}</span></div>`
    },

        // 6-Month Sum Forecast
    { field: 'forecastPd', headerName: 'Sum m0', type: 'customNumericColumn', width: 105, headerClass: 'header-forecast ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm1Forecast', headerName: 'Sum m1', type: 'customNumericColumn', width: 105, headerClass: 'header-forecast ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm2Forecast', headerName: 'Sum m2', type: 'customNumericColumn', width: 105, headerClass: 'header-forecast ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm3Forecast', headerName: 'Sum m3', type: 'customNumericColumn', width: 105, headerClass: 'header-forecast ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm4Forecast', headerName: 'Sum m4', type: 'customNumericColumn', width: 105, headerClass: 'header-forecast ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm5Forecast', headerName: 'Sum m5', type: 'customNumericColumn', width: 105, headerClass: 'header-forecast group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'avgUsage',       headerName: 'Avg Usage',            type: 'customNumericColumn', width: 125, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'คลิกเพื่อดูรายละเอียด Avg Usage (Historical) ราย Part',
      valueGetter: (p: any) => p.data.iss != null ? p.data.iss : null,
      cellRenderer: (p: any) => {
        let warningHtml = '';
        if (p.data?.isBroken100 || p.data?.brokenRate === 100) {
           warningHtml = `<i class="bi bi-exclamation-triangle-fill text-danger me-1 fs-6" title="Warning: มีประวัติเบิกใช้เป็นสถานะ Broken 100% (คำนวณอิงตาม Engineer Usage)"></i>`;
        } else if (p.data?.brokenAlert) {
           warningHtml = `<i class="bi bi-exclamation-triangle-fill text-warning me-1" title="Warning: มีประวัติแตกหัก (Broken) สูงผิดปกติในบาง Part (คลิกเพื่อดูรายละเอียด)"></i>`;
        }

        if (p.data.iss == null) {
          return `<div class="d-flex align-items-center justify-content-end h-100">
                    ${warningHtml}
                    <a href="javascript:void(0)" class="fw-bold text-muted text-decoration-underline" style="cursor: pointer;">N/A</a>
                  </div>`;
        }
        return `<div class="d-flex align-items-center justify-content-end h-100">
                  ${warningHtml}
                  <a href="javascript:void(0)" class="fw-bold text-primary text-decoration-underline" style="cursor: pointer;">${p.value != null ? p.value.toLocaleString() : '-'}</a>
                </div>`;
      },
      onCellClicked: (params: any) => {
        if (params.data.partUsageDetailsArray && params.data.partUsageDetailsArray.length > 0) {
           this.openAvgUsagePopup(params.data);
        }
      }
    },
    { field: 'advanceAchieveRate', headerName: 'Advance Achieve Rate', type: 'customNumericColumn', width: 160,  headerClass: 'header-params ag-right-aligned-header',
      headerComponent: CustomExpandableHeader,
      headerComponentParams: {
         isExpanded: () => this.showAdvancedRates,
         onExpandClicked: () => this.toggleAdvancedRates()
      },
      cellRenderer: (p: any) => {
        const val = p.value != null ? p.value : 100;
        return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${val}%</span></div>`;
      },
      tooltipValueGetter: () => 'สูตรคำนวณ: Broken Rate * Achieve Rate'
    },
    { field: 'advOrderQty',    headerName: 'Advance Order Qty',    type: 'customNumericColumn', width: 155, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => `สูตรคำนวณ (${this.getDisplaySelectedRateMonth()}): (Part Qty ต่อ Position / (Advance Achieve Rate * Avg Usage)) * จำนวน Position`,
      valueGetter: (p: any) => {
        if (!p.data) return null;
        const month = this.selectedRateMonth;
        let offset = 0;
        if (month === 'M1') offset = 1;
        else if (month === 'M2') offset = 2;
        else if (month === 'M3') offset = 3;
        else if (month === 'M4') offset = 4;
        else if (month === 'M5') offset = 5;

        if (offset === 0) return p.data.advOrderQty != null ? p.data.advOrderQty : this.calcAdvOrderQty(p.data, 0);
        const prop = `advOrderQtyM${offset}`;
        return p.data[prop] != null ? p.data[prop] : this.calcAdvOrderQty(p.data, offset);
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'achieveRate',    headerName: 'Achieve Rate',         type: 'customNumericColumn', width: 140, hide: true, headerClass: 'header-params ag-right-aligned-header', editable: true,
      tooltipValueGetter: () => '(Avg Usage / Engineer Usage) * 100',
      cellRenderer: (p: any) => {
        const val = p.value != null ? p.value : 100;
        if (p.colDef.editable) return `<div class="editable-cell-wrapper"><span class="fw-bold text-primary">${val}%</span></div>`;
        return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-primary">${val}%</span></div>`;
      }
    },
    { field: 'pB', headerName: 'Broken Rate', type: 'customNumericColumn', width: 120, hide: true, headerClass: 'header-params ag-right-aligned-header',
      cellRenderer: (p: any) => {
        const val = p.value != null ? p.value : 1;
        return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-secondary">${val.toFixed(2)}</span></div>`;
      },
      tooltipValueGetter: () => '(จำนวนบิล Usage + Burr ของ Part นี้) / จำนวนบิลทั้งหมดของ Part นี้'
    },
    { field: 'normalRate',     headerName: 'Normal',               type: 'customNumericColumn', width: 110,  headerClass: 'header-params ag-right-aligned-header', editable: true,
      tooltipValueGetter: () => 'เป้าหมายสต็อกเผื่อเหลือเผื่อขาด (Safety Target %)',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        const month = this.selectedRateMonth;
        if (month === 'M1') return p.data.normalRateM1;
        if (month === 'M2') return p.data.normalRateM2;
        if (month === 'M3') return p.data.normalRateM3;
        if (month === 'M4') return p.data.normalRateM4;
        if (month === 'M5') return p.data.normalRateM5;
        return p.data.normalRate;
      },
      valueSetter: (p: any) => {
        if (!p.data) return false;
        const month = this.selectedRateMonth;
        const val = Number(p.newValue) || 0;
        if (month === 'M1') p.data.normalRateM1 = val;
        else if (month === 'M2') p.data.normalRateM2 = val;
        else if (month === 'M3') p.data.normalRateM3 = val;
        else if (month === 'M4') p.data.normalRateM4 = val;
        else if (month === 'M5') p.data.normalRateM5 = val;
        else p.data.normalRate = val;
        return true;
      },
      cellRenderer: (p: any) => {
        if (p.colDef.editable) return `<div class="editable-cell-wrapper"><span class="fw-bold text-primary">${p.value != null ? p.value : 120}%</span></div>`;
        return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-primary">${p.value != null ? p.value : 120}%</span></div>`;
      }
    },
    { field: 'orderRate',      headerName: 'Order Rate',           type: 'customNumericColumn', width: 115, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => '(Normal Rate / Advance Achieve Rate) * 100',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        const month = this.selectedRateMonth;
        if (month === 'M1') return p.data.orderRateM1;
        if (month === 'M2') return p.data.orderRateM2;
        if (month === 'M3') return p.data.orderRateM3;
        if (month === 'M4') return p.data.orderRateM4;
        if (month === 'M5') return p.data.orderRateM5;
        return p.data.orderRate;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-info">${p.value != null ? p.value : 120}%</span></div>`
    },
    { field: 'sumAdvOrderQty', headerName: 'Adv Order M0',    type: 'customNumericColumn', width: 145, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'ผลรวมของ Advance Order Qty ทั้งหมดของ Item No. นี้ (เดือนปัจจุบัน)',
      valueGetter: (p: any) => p.data?.sumAdvOrderQty != null ? p.data.sumAdvOrderQty : (p.data?.advOrderQty ?? 0),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'summaryOrderQty', headerName: 'Summary Order M0',   type: 'customNumericColumn', width: 160, headerClass: 'header-params group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      tooltipValueGetter: () => 'ยอดสรุปสั่งซื้อ: Math.ceil(Advance Order Qty * (Order Rate / 100)) (เดือนปัจจุบัน)',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.summaryOrderQty != null) return p.data.summaryOrderQty;
        const sumAdv = Number(p.data.sumAdvOrderQty) || Number(p.data.advOrderQty) || 0;
        const rate = (this.selectedRateMonth === 'default')
          ? (p.data.orderRate ?? p.data.normalRate ?? 120)
          : (p.data[`orderRate${this.selectedRateMonth}`] ?? p.data[`normalRate${this.selectedRateMonth}`] ?? 120);
        return Math.ceil(sumAdv * ((rate || 120) / 100));
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    // --- Monthly Columns M1 to M5 ---
    { field: 'sumAdvOrderQtyM1', headerName: 'Adv Order M1',    type: 'customNumericColumn', width: 145, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'ผลรวมของ Advance Order Qty (M1)',
      valueGetter: (p: any) => p.data?.sumAdvOrderQtyM1 != null ? p.data.sumAdvOrderQtyM1 : (p.data?.advOrderQtyM1 ?? 0),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'summaryOrderQtyM1', headerName: 'Summary Order M1',   type: 'customNumericColumn', width: 160, headerClass: 'header-params group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      tooltipValueGetter: () => 'ยอดสรุปสั่งซื้อ (M1)',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.summaryOrderQtyM1 != null) return p.data.summaryOrderQtyM1;
        const sumAdv = Number(p.data.sumAdvOrderQtyM1) || Number(p.data.advOrderQtyM1) || 0;
        const rate = p.data.orderRateM1 ?? p.data.normalRateM1 ?? 120;
        return Math.ceil(sumAdv * (rate / 100));
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'sumAdvOrderQtyM2', headerName: 'Adv Order M2',    type: 'customNumericColumn', width: 145, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'ผลรวมของ Advance Order Qty (M2)',
      valueGetter: (p: any) => p.data?.sumAdvOrderQtyM2 != null ? p.data.sumAdvOrderQtyM2 : (p.data?.advOrderQtyM2 ?? 0),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'summaryOrderQtyM2', headerName: 'Summary Order M2',   type: 'customNumericColumn', width: 160, headerClass: 'header-params group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      tooltipValueGetter: () => 'ยอดสรุปสั่งซื้อ (M2)',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.summaryOrderQtyM2 != null) return p.data.summaryOrderQtyM2;
        const sumAdv = Number(p.data.sumAdvOrderQtyM2) || Number(p.data.advOrderQtyM2) || 0;
        const rate = p.data.orderRateM2 ?? p.data.normalRateM2 ?? 120;
        return Math.ceil(sumAdv * (rate / 100));
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'sumAdvOrderQtyM3', headerName: 'Adv Order M3',    type: 'customNumericColumn', width: 145, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'ผลรวมของ Advance Order Qty (M3)',
      valueGetter: (p: any) => p.data?.sumAdvOrderQtyM3 != null ? p.data.sumAdvOrderQtyM3 : (p.data?.advOrderQtyM3 ?? 0),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'summaryOrderQtyM3', headerName: 'Summary Order M3',   type: 'customNumericColumn', width: 160, headerClass: 'header-params group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      tooltipValueGetter: () => 'ยอดสรุปสั่งซื้อ (M3)',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.summaryOrderQtyM3 != null) return p.data.summaryOrderQtyM3;
        const sumAdv = Number(p.data.sumAdvOrderQtyM3) || Number(p.data.advOrderQtyM3) || 0;
        const rate = p.data.orderRateM3 ?? p.data.normalRateM3 ?? 120;
        return Math.ceil(sumAdv * (rate / 100));
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'sumAdvOrderQtyM4', headerName: 'Adv Order M4',    type: 'customNumericColumn', width: 145, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'ผลรวมของ Advance Order Qty (M4)',
      valueGetter: (p: any) => p.data?.sumAdvOrderQtyM4 != null ? p.data.sumAdvOrderQtyM4 : (p.data?.advOrderQtyM4 ?? 0),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'summaryOrderQtyM4', headerName: 'Summary Order M4',   type: 'customNumericColumn', width: 160, headerClass: 'header-params group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      tooltipValueGetter: () => 'ยอดสรุปสั่งซื้อ (M4)',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.summaryOrderQtyM4 != null) return p.data.summaryOrderQtyM4;
        const sumAdv = Number(p.data.sumAdvOrderQtyM4) || Number(p.data.advOrderQtyM4) || 0;
        const rate = p.data.orderRateM4 ?? p.data.normalRateM4 ?? 120;
        return Math.ceil(sumAdv * (rate / 100));
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'sumAdvOrderQtyM5', headerName: 'Adv Order M5',    type: 'customNumericColumn', width: 145, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'ผลรวมของ Advance Order Qty (M5)',
      valueGetter: (p: any) => p.data?.sumAdvOrderQtyM5 != null ? p.data.sumAdvOrderQtyM5 : (p.data?.advOrderQtyM5 ?? 0),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'summaryOrderQtyM5', headerName: 'Summary Order M5',   type: 'customNumericColumn', width: 160, headerClass: 'header-params group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      tooltipValueGetter: () => 'ยอดสรุปสั่งซื้อ (M5)',
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.summaryOrderQtyM5 != null) return p.data.summaryOrderQtyM5;
        const sumAdv = Number(p.data.sumAdvOrderQtyM5) || Number(p.data.advOrderQtyM5) || 0;
        const rate = p.data.orderRateM5 ?? p.data.normalRateM5 ?? 120;
        return Math.ceil(sumAdv * (rate / 100));
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'usagePcs',      headerName: 'AVG Engineer Usage',       type: 'customNumericColumn', width: 160, headerClass: 'header-params ag-right-aligned-header',
      tooltipValueGetter: () => 'คลิกเพื่อดูรายละเอียด Usage ราย Part',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><a href="javascript:void(0)" class="fw-bold text-primary text-decoration-underline" style="cursor: pointer;">${p.value != null ? p.value.toLocaleString() : '-'}</a></div>`,
      onCellClicked: (params: any) => this.openEngineerUsagePopup(params.data)
    },
    { field: 'lt',             headerName: 'L/T',                  type: 'customNumericColumn', width: 95,  headerClass: 'header-params ag-center-aligned-header', editable: true,
      cellRenderer: (p: any) => {
        if (p.colDef.editable) return `<div class="editable-cell-wrapper text-center"><span class="badge bg-secondary-subtle text-secondary">${p.value}</span></div>`;
        return `<div class="d-flex align-items-center justify-content-center h-100"><span class="badge bg-secondary-subtle text-secondary">${p.value}</span></div>`;
      }
    },
    // --- Order Plan Columns ---
    { field: 'suggestOrderDate', headerName: 'Suggest Order Date', width: 170, headerClass: 'header-params ag-center-aligned-header', hide: true,
      cellRenderer: (p: any) => {
         if (!p.value) return '-';
         const colorClass = p.data.orderStatus === 'OVERDUE' ? 'text-danger' : (p.data.orderStatus === 'URGENT' ? 'text-warning text-dark' : 'text-primary');
         return `<div class="d-flex align-items-center justify-content-center h-100"><span class="fw-bold ${colorClass}">${p.value}</span></div>`;
      }
    },
        { field: 'dueDate', headerName: 'Due Date', width: 140, headerClass: 'header-params ag-center-aligned-header', hide: true, cellRenderer: (p: any) => { if (!p.value) return '-'; const colorClass = p.data.orderStatus === 'OVERDUE' ? 'text-danger' : (p.data.orderStatus === 'URGENT' ? 'text-warning text-dark' : 'text-primary'); return `<div class="d-flex align-items-center justify-content-center h-100"><span class="fw-bold ${colorClass}">${p.value}</span></div>`; } },
    { field: 'suggestOrderQty', headerName: 'Suggest Order Qty', type: 'customNumericColumn', width: 160, headerClass: 'header-params ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-dark">${p.value != null ? p.value.toLocaleString() : '-'}</span></div>`
    },
    { field: 'confirmQty', headerName: 'Confirm Order', type: 'customNumericColumn', width: 140, headerClass: 'header-params ag-right-aligned-header', hide: true, editable: (p: any) => this.purchaseViewMode === 'orders-date', cellRenderer: (p: any) => { const val = p.value != null ? p.value.toLocaleString() : '-'; const icon = this.purchaseViewMode === 'orders-date' ? '<i class="bi bi-pencil-fill ms-2 text-muted small"></i>' : ''; return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">${val}</span>${icon}</div>`; } },
    { field: 'shortageMonth', headerName: 'Target Run Month', width: 140, headerClass: 'header-params ag-center-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-center h-100"><span class="fw-bold text-secondary">${p.value || '-'}</span></div>`
    },
    { field: 'orderStatus', headerName: 'Status', width: 120, headerClass: 'header-params ag-center-aligned-header', hide: true,
      cellRenderer: (p: any) => {
        if (p.value === 'OVERDUE') return `<div class="d-flex align-items-center justify-content-center h-100"><span class="badge bg-danger shadow-sm py-2 px-3">OVERDUE</span></div>`;
        if (p.value === 'URGENT') return `<div class="d-flex align-items-center justify-content-center h-100"><span class="badge bg-warning text-dark shadow-sm py-2 px-3">URGENT</span></div>`;
        if (p.value === 'NORMAL') return `<div class="d-flex align-items-center justify-content-center h-100"><span class="badge bg-info shadow-sm py-2 px-3">NORMAL</span></div>`;
        if (p.value === 'SAFE') return `<div class="d-flex align-items-center justify-content-center h-100"><span class="badge bg-success shadow-sm py-2 px-3">SAFE</span></div>`;
        return '<div class="d-flex align-items-center justify-content-center h-100">-</div>';
      }
    },
    { field: 'minBalance', headerName: 'Balance Stock', type: 'customNumericColumn', width: 170, headerClass: 'header-params ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => {
         const val = p.value;
         if (val == null) return '-';
         if (val < 0) return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-danger">${val.toLocaleString()}</span></div>`;
         return `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-success">+${val.toLocaleString()}</span></div>`;
      }
    },
    { field: 'stkPd', headerName: 'Stock PD', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-orange-600">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'stkPh', headerName: 'Stock PH', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-orange-600">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'inventoryPd', headerName: 'Inventory PD', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'inventoryPh', headerName: 'Inventory PH', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-dark">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'sumInventory', headerName: 'Sum Inventory', type: 'customNumericColumn', width: 150, headerClass: 'header-stock group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'], hide: true,
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.sumInventory != null) return p.data.sumInventory;
        return (Number(p.data.inventoryPd) || 0) + (Number(p.data.inventoryPh) || 0);
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },
    { field: 'currentStock', headerName: 'Current Stock', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'beg',   headerName: 'BEG',    type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'receive', headerName: 'Receive', type: 'customNumericColumn', width: 140, headerClass: 'header-stock group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-teal-700">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'supplyM1', headerName: 'Total Supply m1', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? (p.data.end || 0) + (p.data.m1Po || 0) + (Number(p.data.m1Request) || 0) : null,
      tooltipValueGetter: (p: any) => {
        if (!p.data) return '';
        const stk = p.data.end || 0;
        const po = p.data.m1Po || 0;
        const pr = Number(p.data.m1Request) || 0;
        const total = stk + po + pr;
        return `Total Supply: ${total.toLocaleString()} (Prev End: ${stk.toLocaleString()} | PO: ${po.toLocaleString()} | PR: ${pr.toLocaleString()})`;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'supplyM2', headerName: 'Total Supply m2', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? (p.data.m1End || 0) + (p.data.m2Po || 0) + (Number(p.data.m2Request) || 0) : null,
      tooltipValueGetter: (p: any) => {
        if (!p.data) return '';
        const stk = p.data.m1End || 0;
        const po = p.data.m2Po || 0;
        const pr = Number(p.data.m2Request) || 0;
        const total = stk + po + pr;
        return `Total Supply: ${total.toLocaleString()} (Prev End: ${stk.toLocaleString()} | PO: ${po.toLocaleString()} | PR: ${pr.toLocaleString()})`;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'supplyM3', headerName: 'Total Supply m3', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? (p.data.m2End || 0) + (p.data.m3Po || 0) + (Number(p.data.m3Request) || 0) : null,
      tooltipValueGetter: (p: any) => {
        if (!p.data) return '';
        const stk = p.data.m2End || 0;
        const po = p.data.m3Po || 0;
        const pr = Number(p.data.m3Request) || 0;
        const total = stk + po + pr;
        return `Total Supply: ${total.toLocaleString()} (Prev End: ${stk.toLocaleString()} | PO: ${po.toLocaleString()} | PR: ${pr.toLocaleString()})`;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'supplyM4', headerName: 'Total Supply m4', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? (p.data.m3End || 0) + (p.data.m4Po || 0) + (Number(p.data.m4Request) || 0) : null,
      tooltipValueGetter: (p: any) => {
        if (!p.data) return '';
        const stk = p.data.m3End || 0;
        const po = p.data.m4Po || 0;
        const pr = Number(p.data.m4Request) || 0;
        const total = stk + po + pr;
        return `Total Supply: ${total.toLocaleString()} (Prev End: ${stk.toLocaleString()} | PO: ${po.toLocaleString()} | PR: ${pr.toLocaleString()})`;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'supplyM5', headerName: 'Total Supply m5', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? (p.data.m4End || 0) + (p.data.m5Po || 0) + (Number(p.data.m5Request) || 0) : null,
      tooltipValueGetter: (p: any) => {
        if (!p.data) return '';
        const stk = p.data.m4End || 0;
        const po = p.data.m5Po || 0;
        const pr = Number(p.data.m5Request) || 0;
        const total = stk + po + pr;
        return `Total Supply: ${total.toLocaleString()} (Prev End: ${stk.toLocaleString()} | PO: ${po.toLocaleString()} | PR: ${pr.toLocaleString()})`;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'totalSupply',   headerName: 'Total m0',    type: 'customNumericColumn', width: 130, headerClass: 'header-stock group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'], hide: true,
      valueGetter: (p: any) => {
        if (!p.data) return null;
        if (p.data.totalSupply != null) return p.data.totalSupply;
        const invPd = Number(p.data.inventoryPd) || 0;
        const invPh = Number(p.data.inventoryPh) || 0;
        const rcv = Number(p.data.receive) || 0;
        const po = Number(p.data.in) || 0;
        const pr = Number(p.data.pr) || 0;
        return invPd + invPh + rcv + po + pr;
      },
      tooltipValueGetter: (p: any) => {
        if (!p.data) return '';
        const invPd = Number(p.data.inventoryPd) || 0;
        const invPh = Number(p.data.inventoryPh) || 0;
        const rcv = Number(p.data.receive) || 0;
        const po = Number(p.data.in) || 0;
        const pr = Number(p.data.pr) || 0;
        const total = invPd + invPh + rcv + po + pr;
        return `Total: ${total.toLocaleString()} (PD: ${invPd.toLocaleString()} | PH: ${invPh.toLocaleString()} | Receive: ${rcv.toLocaleString()} | PO: ${po.toLocaleString()} | PR: ${pr.toLocaleString()})`;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-primary fs-6">${p.value != null ? Number(p.value).toLocaleString() : '0'}</span></div>`
    },

    { field: 'unitPrice', headerName: 'Unit Price (฿)', type: 'customNumericColumn', width: 130, headerClass: 'header-vendor ag-right-aligned-header',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="text-secondary fw-semibold">฿${p.value != null ? p.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</span></div>`
    },
    { field: 'amount', headerName: 'Total Price', type: 'customNumericColumn', width: 120, headerClass: 'header-vendor group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100"><span class="fw-bold text-primary">฿${p.value != null ? p.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</span></div>`
    },
    { field: 'vendorCode', headerName: 'Vendor Code', width: 120, headerClass: 'header-vendor',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="badge bg-light text-secondary border px-2 py-1 rounded-3"><i class="bi bi-shop me-1 text-muted"></i>${p.value || '-'}</span></div>`
    },
    { field: 'vendorName', headerName: 'Vendor Name', width: 200, headerClass: 'header-vendor',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center h-100"><span class="text-muted small">${p.value || '-'}</span></div>`
    },
    { field: 'deleteAction', headerName: '', width: 60, headerClass: 'header-vendor',
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-center h-100"><button class="btn btn-sm text-danger border-0 p-0" title="Remove from Order"><i class="bi bi-trash fs-5"></i></button></div>`
    },

    // --- DAILY MONITOR (Issue, Balance Issue, Stock on-hand, BL USE Month) ---
    { field: 'issue', headerName: 'Issue', type: 'customNumericColumn', width: 110, headerClass: 'header-monitor ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace fw-semibold text-primary">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'balanceIssue', headerName: 'Balance issue', type: 'customNumericColumn', width: 130, headerClass: 'header-monitor ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => {
        const val = p.value;
        if (val == null || val === 0) return `<div class="d-flex align-items-center justify-content-end h-100 font-monospace text-muted">-</div>`;
        return `<div class="d-flex align-items-center justify-content-end h-100 font-monospace fw-bold text-dark">${val.toLocaleString()}</div>`;
      }
    },
    { field: 'stockOnHand', headerName: 'Stock on-hand', type: 'customNumericColumn', width: 130, headerClass: 'header-monitor ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace fw-bold text-primary">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'dailyTotalSupply', headerName: 'Total Supply', type: 'customNumericColumn', width: 130, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      tooltipValueGetter: (p: any) => {
        if (!p.data) return '';
        const onHand = p.data.stockOnHand || 0;
        return `Total Supply: ${p.value != null ? p.value.toLocaleString() : '0'} (Stock on-hand: ${onHand.toLocaleString()})`;
      },
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-black text-orange-700 fs-6">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'blUseMonth', headerName: 'Balance Use Month', type: 'customNumericColumn', width: 160, headerClass: 'header-bl-use ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => {
        const val = p.value;
        if (val == null) return `<div class="d-flex align-items-center justify-content-end h-100 text-muted font-monospace">-</div>`;
        if (val < 0) {
          return `<div class="d-flex align-items-center justify-content-end h-100 px-2 w-100 cell-bl-negative font-monospace fw-bold text-danger">
                    - ${Math.abs(val).toLocaleString()}
                  </div>`;
        }
        if (val === 0) {
          return `<div class="d-flex align-items-center justify-content-end h-100 px-2 w-100 cell-bl-positive font-monospace fw-bold text-dark">
                    0
                  </div>`;
        }
        return `<div class="d-flex align-items-center justify-content-end h-100 px-2 w-100 cell-bl-positive font-monospace fw-bold text-dark">
                  ${val.toLocaleString()}
                </div>`;
      }
    },
    { field: 'issueDate', headerName: 'Date', width: 130, headerClass: 'header-monitor ag-center-aligned-header', hide: true,
      cellRenderer: (p: any) => {
        const val = p.value;
        if (!val || val === '-') return `<div class="d-flex align-items-center justify-content-center h-100 font-monospace text-muted">-</div>`;
        return `<div class="d-flex align-items-center justify-content-center h-100 font-monospace fw-semibold text-dark">${val}</div>`;
      }
    },

    // --- USAGE ---
    { field: 'planSetup', headerName: 'Demand m0', type: 'customNumericColumn', width: 120, headerClass: 'header-forecast ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'issM1', headerName: 'Demand m1', type: 'customNumericColumn', width: 120, headerClass: 'header-forecast ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'issM2', headerName: 'Demand m2', type: 'customNumericColumn', width: 120, headerClass: 'header-forecast ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'issM3', headerName: 'Demand m3', type: 'customNumericColumn', width: 120, headerClass: 'header-forecast ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'issM4', headerName: 'Demand m4', type: 'customNumericColumn', width: 120, headerClass: 'header-forecast ag-right-aligned-header', hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'issM5', headerName: 'Demand m5', type: 'customNumericColumn', width: 120, headerClass: 'header-forecast group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'], hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },

    // --- BEGIN CONTINUOUS ---
    { field: 'm1Beg', headerName: 'Begin m1', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? p.data.end : null,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-dark">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'm2Beg', headerName: 'Begin m2', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? p.data.m1End : null,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-dark">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'm3Beg', headerName: 'Begin m3', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? p.data.m2End : null,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-dark">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'm4Beg', headerName: 'Begin m4', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? p.data.m3End : null,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-dark">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },
    { field: 'm5Beg', headerName: 'Begin m5', type: 'customNumericColumn', width: 140, headerClass: 'header-stock ag-right-aligned-header', hide: true,
      valueGetter: (p: any) => p.data ? p.data.m4End : null,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace"><span class="fw-bold text-dark">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
    },

    // --- PO ---
    { field: 'in', headerName: 'PO m0', type: 'customNumericColumn', width: 140, headerClass: 'header-incoming ag-right-aligned-header', editable: false, hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm1Po', headerName: 'PO m1', type: 'customNumericColumn', width: 140, headerClass: 'header-incoming ag-right-aligned-header', editable: false, hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm2Po', headerName: 'PO m2', type: 'customNumericColumn', width: 140, headerClass: 'header-incoming ag-right-aligned-header', editable: false, hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm3Po', headerName: 'PO m3', type: 'customNumericColumn', width: 140, headerClass: 'header-incoming ag-right-aligned-header', editable: false, hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm4Po', headerName: 'PO m4', type: 'customNumericColumn', width: 140, headerClass: 'header-incoming ag-right-aligned-header', editable: false, hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },
    { field: 'm5Po', headerName: 'PO m5', type: 'customNumericColumn', width: 140, headerClass: 'header-incoming group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'], editable: false, hide: true,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">${p.value != null ? p.value.toLocaleString() : '0'}</div>`
    },

    // --- PR ---
    { field: 'pr', headerName: 'PR m0', type: 'customNumericColumn', width: 140, headerClass: 'header-request ag-right-aligned-header', editable: false,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 w-100 font-monospace">` +
        (p.value > 0 ? `<span class="fw-bold text-dark">${p.value.toLocaleString()}</span>` : `<span class="text-muted opacity-50">-</span>`) + `</div>`
    },
    { field: 'm1Request', headerName: 'PR m1', type: 'customNumericColumn', width: 140, headerClass: 'header-request ag-right-aligned-header', editable: false,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 w-100 font-monospace">` +
        (p.colDef.editable ? `<div class="editable-cell-wrapper"><span class="fw-bold text-amber-700">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
        : (p.value > 0 ? `<span class="fw-bold text-dark">${p.value.toLocaleString()}</span>` : `<span class="text-muted opacity-50">-</span>`)) + `</div>`
    },
    { field: 'm2Request', headerName: 'PR m2', type: 'customNumericColumn', width: 140, headerClass: 'header-request ag-right-aligned-header', editable: false,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 w-100 font-monospace">` +
        (p.colDef.editable ? `<div class="editable-cell-wrapper"><span class="fw-bold text-amber-700">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
        : (p.value > 0 ? `<span class="fw-bold text-dark">${p.value.toLocaleString()}</span>` : `<span class="text-muted opacity-50">-</span>`)) + `</div>`
    },
    { field: 'm3Request', headerName: 'PR m3', type: 'customNumericColumn', width: 140, headerClass: 'header-request ag-right-aligned-header', editable: false,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 w-100 font-monospace">` +
        (p.colDef.editable ? `<div class="editable-cell-wrapper"><span class="fw-bold text-amber-700">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
        : (p.value > 0 ? `<span class="fw-bold text-dark">${p.value.toLocaleString()}</span>` : `<span class="text-muted opacity-50">-</span>`)) + `</div>`
    },
    { field: 'm4Request', headerName: 'PR m4', type: 'customNumericColumn', width: 140, headerClass: 'header-request ag-right-aligned-header', editable: false,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 w-100 font-monospace">` +
        (p.colDef.editable ? `<div class="editable-cell-wrapper"><span class="fw-bold text-amber-700">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
        : (p.value > 0 ? `<span class="fw-bold text-dark">${p.value.toLocaleString()}</span>` : `<span class="text-muted opacity-50">-</span>`)) + `</div>`
    },
    { field: 'm5Request', headerName: 'PR m5', type: 'customNumericColumn', width: 140, headerClass: 'header-request group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'], editable: false,
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 w-100 font-monospace">` +
        (p.colDef.editable ? `<div class="editable-cell-wrapper"><span class="fw-bold text-amber-700">${p.value != null ? p.value.toLocaleString() : '0'}</span></div>`
        : (p.value > 0 ? `<span class="fw-bold text-dark">${p.value.toLocaleString()}</span>` : `<span class="text-muted opacity-50">-</span>`)) + `</div>`
    },

    // --- END BALANCE ---
    { field: 'end', headerName: 'End m0', type: 'customNumericColumn', width: 140, headerClass: 'header-balance ag-right-aligned-header',
      cellStyle: (p: any) => ({ borderRight: '2px solid #cbd5e1' }),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">` + (p.value < 0 ? `<span class="fw-bold text-danger">${p.value.toLocaleString()}</span>` : `<span class="fw-bold text-emerald-700">${p.value.toLocaleString()}</span>`) + `</div>`
    },
    { field: 'm1End', headerName: 'End m1', type: 'customNumericColumn', width: 140, headerClass: 'header-balance ag-right-aligned-header',
      cellStyle: (p: any) => ({ borderRight: '2px solid #cbd5e1' }),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">` + (p.value < 0 ? `<span class="fw-bold text-danger">${p.value.toLocaleString()}</span>` : `<span class="fw-bold text-emerald-700">${p.value.toLocaleString()}</span>`) + `</div>`
    },
    { field: 'm2End', headerName: 'End m2', type: 'customNumericColumn', width: 140, headerClass: 'header-balance ag-right-aligned-header',
      cellStyle: (p: any) => ({ borderRight: '2px solid #cbd5e1' }),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">` + (p.value < 0 ? `<span class="fw-bold text-danger">${p.value.toLocaleString()}</span>` : `<span class="fw-bold text-emerald-700">${p.value.toLocaleString()}</span>`) + `</div>`
    },
    { field: 'm3End', headerName: 'End m3', type: 'customNumericColumn', width: 140, headerClass: 'header-balance ag-right-aligned-header',
      cellStyle: (p: any) => ({ borderRight: '2px solid #cbd5e1' }),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">` + (p.value < 0 ? `<span class="fw-bold text-danger">${p.value.toLocaleString()}</span>` : `<span class="fw-bold text-emerald-700">${p.value.toLocaleString()}</span>`) + `</div>`
    },
    { field: 'm4End', headerName: 'End m4', type: 'customNumericColumn', width: 140, headerClass: 'header-balance ag-right-aligned-header',
      cellStyle: (p: any) => ({ borderRight: '2px solid #cbd5e1' }),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">` + (p.value < 0 ? `<span class="fw-bold text-danger">${p.value.toLocaleString()}</span>` : `<span class="fw-bold text-emerald-700">${p.value.toLocaleString()}</span>`) + `</div>`
    },
    { field: 'm5End', headerName: 'End m5', type: 'customNumericColumn', width: 140, headerClass: 'header-balance group-divider ag-right-aligned-header', cellClass: ['group-divider', 'ag-right-aligned-cell'],
      cellStyle: (p: any) => ({ borderRight: '2px solid #cbd5e1' }),
      cellRenderer: (p: any) => `<div class="d-flex align-items-center justify-content-end h-100 font-monospace">` + (p.value < 0 ? `<span class="fw-bold text-danger">${p.value.toLocaleString()}</span>` : `<span class="fw-bold text-emerald-700">${p.value.toLocaleString()}</span>`) + `</div>`
    },
    // --- FILLER COLUMN ---
    { field: 'empty_filler', headerName: '', flex: 1, minWidth: 10, sortable: false, filter: false, suppressMenu: true, cellStyle: { border: 'none' } }

  ];

  ordersColDefs: any[] = [
    {
      field: 'orderId',
      headerName: 'Order ID',
      checkboxSelection: true,
      headerCheckboxSelection: true,
      flex: 1.5,
      editable: false
    },
    { field: 'process', headerName: 'Process', flex: 1.2 },
    { field: 'mc',      headerName: 'MC',      flex: 1.2 },
    { field: 'partNo',  headerName: 'Part No', flex: 1.2 },
    { field: 'targetMonth', headerName: 'Target Month', flex: 1 },
    { field: 'partRev', headerName: 'Rev',     width: 80 },
    { field: 'partQty', headerName: 'Part Qty', type: 'numericColumn', flex: 1 }
  ];

  // Grid Events
  onForecastGridReady(params: GridReadyEvent) {
    this.forecastGridApi = params.api;
    if (this.pendingForecastData !== null) {
      this.forecastGridApi.setGridOption('rowData', this.pendingForecastData);
      this.forecastRowData     = [...this.pendingForecastData];
      this.pendingForecastData = null;
      this.cdr.detectChanges();
    }
    const savedFilter = sessionStorage.getItem('forecastFilterModel');
    if (savedFilter && this.forecastGridApi) {
      setTimeout(() => {
         this.forecastGridApi.setFilterModel(JSON.parse(savedFilter));
      }, 100);
    }
  }

  onForecastFilterChanged(event: any) {
    if (this.forecastGridApi) {
      const filterModel = this.forecastGridApi.getFilterModel();
      sessionStorage.setItem('forecastFilterModel', JSON.stringify(filterModel));
    }
  }

  // --- Forecast Pagination Methods ---
  onForecastPaginationChanged(event: any) {
    if (this.forecastGridApi) {
      this.forecastCurrentPage = (this.forecastGridApi.paginationGetCurrentPage() || 0) + 1;
      this.forecastTotalPages = this.forecastGridApi.paginationGetTotalPages() || 0;
      this.forecastTotalRows = this.forecastGridApi.getDisplayedRowCount() || 0;
      this.updateForecastPaginationPages();
      this.cdr.detectChanges();
    }
  }

  goToForecastPage(page: number | string) {
    if (typeof page === 'number' && this.forecastGridApi) {
      this.forecastGridApi.paginationGoToPage(page - 1);
    }
  }

  goToNextForecastPage() {
    if (this.forecastGridApi) {
      this.forecastGridApi.paginationGoToNextPage();
    }
  }

  goToPrevForecastPage() {
    if (this.forecastGridApi) {
      this.forecastGridApi.paginationGoToPreviousPage();
    }
  }

  updateForecastPaginationPages() {
    const pages: (number | string)[] = [];
    const total = this.forecastTotalPages || 0;
    const current = this.forecastCurrentPage || 1;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      if (current <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', total);
      } else if (current >= total - 3) {
        pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
      } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
      }
    }

    // Only update if changed to avoid unnecessary change detection
    if (JSON.stringify(this.forecastPaginationPagesArr) !== JSON.stringify(pages)) {
       this.forecastPaginationPagesArr = pages;
    }
  }

  getForecastPaginationPages(): (number | string)[] {
    return this.forecastPaginationPagesArr;
  }

  onOrdersGridReady(params: GridReadyEvent) {
    this.ordersGridApi = params.api;
    setTimeout(() => {
      if (this.ordersGridApi) {
        const savedFilter = sessionStorage.getItem('ordersFilterModel');
        if (savedFilter) {
          this.ordersGridApi.setFilterModel(JSON.parse(savedFilter));
        }
      }
    }, 100);
  }

  onOrdersFilterChanged(event: any) {
    if (this.ordersGridApi) {
      const filterModel = this.ordersGridApi.getFilterModel();
      sessionStorage.setItem('ordersFilterModel', JSON.stringify(filterModel));
    }
  }

  onPurchaseGridReady(params: any) {
    this.purchaseGridApi = params.api;
    this.applyViewModeColumns();
    setTimeout(() => {
      if (this.purchaseGridApi) {
        // this.purchaseGridApi.sizeColumnsToFit();
        const savedFilter = sessionStorage.getItem('purchaseFilterModel');
        if (savedFilter) {
          this.purchaseGridApi.setFilterModel(JSON.parse(savedFilter));
        }
      }
    }, 100);
  }

  onPurchaseFilterChanged(event: any) {
    if (this.purchaseGridApi) {
      const filterModel = this.purchaseGridApi.getFilterModel();
      sessionStorage.setItem('purchaseFilterModel', JSON.stringify(filterModel));
      this.recalculateTotals();
    }
  }

  // --- Custom Pagination Methods ---
  onPaginationChanged(event: any) {
    if (this.purchaseGridApi) {
      this.currentPage = (this.purchaseGridApi.paginationGetCurrentPage() || 0) + 1;
      this.totalPages = this.purchaseGridApi.paginationGetTotalPages() || 0;
      this.totalRows = this.purchaseGridApi.getDisplayedRowCount() || 0;
      this.updatePaginationPages();
      this.cdr.detectChanges();
    }
  }

  goToPage(page: number | string) {
    if (typeof page === 'number' && this.purchaseGridApi) {
      this.purchaseGridApi.paginationGoToPage(page - 1);
    }
  }

  goToNextPage() {
    if (this.purchaseGridApi) {
      this.purchaseGridApi.paginationGoToNextPage();
    }
  }

  goToPrevPage() {
    if (this.purchaseGridApi) {
      this.purchaseGridApi.paginationGoToPreviousPage();
    }
  }

  onPageSizeChange(event: any) {
    const newSize = Number(event.target.value);
    this.pageSize = newSize;
    if (this.purchaseGridApi) {
      this.purchaseGridApi.paginationSetPageSize(newSize);
    }
  }

  updatePaginationPages() {
    const pages: (number | string)[] = [];
    const total = this.totalPages;
    const current = this.currentPage;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      if (current <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', total);
      } else if (current >= total - 3) {
        pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
      } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
      }
    }

    if (JSON.stringify(this.paginationPagesArr) !== JSON.stringify(pages)) {
       this.paginationPagesArr = pages;
    }
  }

  getPaginationPages(): (number | string)[] {
    return this.paginationPagesArr;
  }

  onGridSizeChanged(params: any, colDefs: any[]) {
    // Resizing disabled
  }

  onPurchaseGridSizeChanged(params: any) {
    this.onGridSizeChanged(params, this.purchaseColDefs);
  }

  updateRateColumns() {
    if (this.purchaseViewMode !== 'parameters') {
      this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
      if (this.purchaseGridApi) {
        this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
      }
    }
    if (this.purchaseGridApi) {
      this.purchaseGridApi.refreshCells({ force: true });
    }
    this.cdr.detectChanges();
  }

  getDisplaySelectedRateMonth(): string {
    const ctx = this.selectedRateMonth === 'default' ? 'm0' : this.selectedRateMonth.toLowerCase();
    return this.getMonthNameForContext(ctx as any);
  }

  setRateMonth(month: string) {
    this.selectedRateMonth = month;
    this.applyViewModeColumns();
    this.updateRateColumns();
  }

  updateTargetMonthOptions() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m0Index = months.findIndex(m => m.toLowerCase() === (this.selectedMonth || 'january').substring(0, 3).toLowerCase());
    const currentYear = parseInt(this.selectedYear || '2026', 10);
    this.targetMonthOptions = [];
    for (let i = 0; i < 6; i++) {
      const mIndex = (m0Index + i) % 12;
      const year = currentYear + Math.floor((m0Index + i) / 12);
      this.targetMonthOptions.push({ offset: i, label: `${months[mIndex]} ${year}` });
    }
  }

  calculatePurchaseData() {
    this.updateTargetMonthOptions();
    this.purchaseRowData = [];
    if (this.purchaseGridApi) {
      this.purchaseGridApi.setGridOption('rowData', []);
    }

    Swal.fire({
      title: 'Calculating...',
      html: `
        <div aria-label="Orange and tan hamster running in a metal wheel" role="img" class="wheel-and-hamster mx-auto my-4">
          <div class="wheel"></div>
          <div class="hamster">
            <div class="hamster__body">
              <div class="hamster__head">
                <div class="hamster__ear"></div>
                <div class="hamster__eye"></div>
                <div class="hamster__nose"></div>
              </div>
              <div class="hamster__limb hamster__limb--fr"></div>
              <div class="hamster__limb hamster__limb--fl"></div>
              <div class="hamster__limb hamster__limb--br"></div>
              <div class="hamster__limb hamster__limb--bl"></div>
              <div class="hamster__tail"></div>
            </div>
          </div>
          <div class="spoke"></div>
        </div>
        <div class="text-muted mt-3">Fetching PC plan and calculating Purchase requirements...</div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false
    });

    if (this.dbConnected) {
      const prev = this.getPreviousMonth(this.selectedMonth, this.selectedYear);
      forkJoin({
        pcPlanData: this.forecastService.getPCPlan(this.selectedMonth, this.selectedYear, this.selectedRevision),
        poData: this.forecastService.getIncomingPO(this.selectedYear, this.selectedMonth),
        prData: this.forecastService.getIncomingPR(this.selectedYear, this.selectedMonth),
        usageData: this.forecastService.getToolingUsageParameters(),
        stockData: this.forecastService.getStockOnRack(),
        balanceData: this.forecastService.getForecastBalance(prev.prevMonth, prev.prevYear, ''),
        dailyIssueData: this.forecastService.getDailyIssue(this.selectedYear, this.selectedMonth).pipe(catchError(() => of([]))),
        dailyStockSummary: this.forecastService.getCuttingToolsStockSummary(this.selectedYear, this.selectedMonth).pipe(catchError(() => of([]))),
        dailyCuttingtoolsInventory: this.forecastService.getCuttingToolsInventoryDaily(this.selectedYear, this.selectedMonth).pipe(catchError(() => of([])))
      }).subscribe({
        next: (result) => {
          this.carryForwardBalances.clear();
          if (result.balanceData && result.balanceData.length) {
            result.balanceData.forEach((b: any) => this.carryForwardBalances.set(String(b.ItemNo).trim().toUpperCase(), Number(b.EndStock)));
          }
          this.rawPurchaseResult = {
            pcPlanData: result.pcPlanData,
            poData: result.poData,
            prData: result.prData,
            usageData: result.usageData,
            stockData: result.stockData,
            dailyIssueData: result.dailyIssueData || [],
            dailyStockSummary: result.dailyStockSummary || [],
            dailyCuttingtoolsInventory: result.dailyCuttingtoolsInventory || []
          };
          this.processPurchaseData(
            result.pcPlanData,
            result.poData,
            result.prData,
            result.usageData,
            result.stockData,
            result.dailyIssueData || [],
            result.dailyStockSummary || [],
            result.dailyCuttingtoolsInventory || []
          );
          Swal.close();
        },
        error: (err) => {
          Swal.close();
          Swal.fire({
            icon: 'error',
            title: 'Calculation Failed',
            text: `Could not fetch data: ${err.error?.error || err.message}`
          });
        }
      });
    } else {
      // Offline/Simulation Mode
      this.rawPurchaseResult = {
        pcPlanData: this.forecastRowData,
        poData: [],
        prData: [],
        usageData: [],
        stockData: [],
        dailyIssueData: [],
        dailyStockSummary: [],
        dailyCuttingtoolsInventory: []
      };
      this.processPurchaseData(this.forecastRowData, [], [], [], [], [], [], []);
      Swal.close();
    }
  }

  processPurchaseData(
    pcPlanData: any[],
    poData: any[] = [],
    prData: any[] = [],
    usageData: any[] = [],
    stockData: any[] = [],
    dailyIssueData: any[] = [],
    dailyStockSummary: any[] = [],
    dailyCuttingtoolsInventory: any[] = []
  ) {
    // 1. Group by ItemNo
    const itemMap = new Map<string, any>();

    const extractYYYYMM = (m: any) => {
      if (!m) return '';
      const d = new Date(m);
      if (isNaN(d.getTime())) return m;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // Sort pcPlanData chronologically by targetMonth
    const pcPlanDataWithTimestamp = pcPlanData.map(r => ({ ...r, _targetTime: new Date(r.targetMonth || 0).getTime() }));
    const sortedData = pcPlanDataWithTimestamp.sort((a, b) => a._targetTime - b._targetTime);
    const uniqueMonths = Array.from(new Set(sortedData.map(r => extractYYYYMM(r.targetMonth)).filter(Boolean))).sort();

        let m0 = uniqueMonths[0];
    let m1 = uniqueMonths[1];
    let m2 = uniqueMonths[2];
    let m3 = uniqueMonths[3];
    let m4 = uniqueMonths[4];
    let m5 = uniqueMonths[5];

    if (m0) {
      const getNextMonth = (base, offset) => {
        const [yyyy, mm] = base.split('-');
        const d = new Date(parseInt(yyyy), parseInt(mm) - 1 + offset, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      if (!m1) m1 = getNextMonth(m0, 1);
      if (!m2) m2 = getNextMonth(m0, 2);
      if (!m3) m3 = getNextMonth(m0, 3);
      if (!m4) m4 = getNextMonth(m0, 4);
      if (!m5) m5 = getNextMonth(m0, 5);
    }

    const formatMonth = (m: any) => {
      if (!m) return '';
      const parts = String(m).split('-');
      if (parts.length >= 2) {
        const monthIndex = parseInt(parts[1], 10) - 1;
        const shortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return shortNames[monthIndex] || m;
      }
      return m;
    };

    // Update Headers dynamically based on the months available
    if (m0 || m1 || m2 || m3 || m4 || m5) {
      const updatedColDefs = [...this.purchaseColDefs];

      const updateHeader = (field: string, text: string) => {
        const col = updatedColDefs.find(c => c.field === field);
        if (col) col.headerName = text;
      };

      if (m0) {
        updateHeader('beg', `Begin ${formatMonth(m0)}`);
        updateHeader('receive', `Receive ${formatMonth(m0)}`);
        updateHeader('totalSupply', `Total ${formatMonth(m0)}`);
        updateHeader('forecastPd', `Sum ${formatMonth(m0)}`);
        updateHeader('planSetup', `Forecast ${formatMonth(m0)}`);
        updateHeader('in', `PO ${formatMonth(m0)}`);
        updateHeader('pr', `PR ${formatMonth(m0)}`);
        updateHeader('end', `End ${formatMonth(m0)}`);
        updateHeader('blUseMonth', `Balance Use ${formatMonth(m0)}`);
        updateHeader('sumAdvOrderQty', `Adv Order ${formatMonth(m0)}`);
        updateHeader('summaryOrderQty', `Summary Order ${formatMonth(m0)}`);
      }
      if (m1) {
        updateHeader('supplyM1', `Total Supply ${formatMonth(m1)}`);
        updateHeader('m1Beg', `Begin ${formatMonth(m1)}`);
        updateHeader('m1Forecast', `Sum ${formatMonth(m1)}`);
        updateHeader('issM1', `Forecast ${formatMonth(m1)}`);
        updateHeader('m1Po', `PO ${formatMonth(m1)}`);
        updateHeader('m1Request', `PR ${formatMonth(m1)}`);
        updateHeader('m1End', `End ${formatMonth(m1)}`);
        updateHeader('sumAdvOrderQtyM1', `Adv Order ${formatMonth(m1)}`);
        updateHeader('summaryOrderQtyM1', `Summary Order ${formatMonth(m1)}`);
      }
      if (m2) {
        updateHeader('supplyM2', `Total Supply ${formatMonth(m2)}`);
        updateHeader('m2Beg', `Begin ${formatMonth(m2)}`);
        updateHeader('m2Forecast', `Sum ${formatMonth(m2)}`);
        updateHeader('issM2', `Forecast ${formatMonth(m2)}`);
        updateHeader('m2Po', `PO ${formatMonth(m2)}`);
        updateHeader('m2Request', `PR ${formatMonth(m2)}`);
        updateHeader('m2End', `End ${formatMonth(m2)}`);
        updateHeader('sumAdvOrderQtyM2', `Adv Order ${formatMonth(m2)}`);
        updateHeader('summaryOrderQtyM2', `Summary Order ${formatMonth(m2)}`);
      }
      if (m3) {
        updateHeader('supplyM3', `Total Supply ${formatMonth(m3)}`);
        updateHeader('m3Beg', `Begin ${formatMonth(m3)}`);
        updateHeader('m3Forecast', `Sum ${formatMonth(m3)}`);
        updateHeader('issM3', `Forecast ${formatMonth(m3)}`);
        updateHeader('m3Po', `PO ${formatMonth(m3)}`);
        updateHeader('m3Request', `PR ${formatMonth(m3)}`);
        updateHeader('m3End', `End ${formatMonth(m3)}`);
        updateHeader('sumAdvOrderQtyM3', `Adv Order ${formatMonth(m3)}`);
        updateHeader('summaryOrderQtyM3', `Summary Order ${formatMonth(m3)}`);
      }
      if (m4) {
        updateHeader('supplyM4', `Total Supply ${formatMonth(m4)}`);
        updateHeader('m4Beg', `Begin ${formatMonth(m4)}`);
        updateHeader('m4Forecast', `Sum ${formatMonth(m4)}`);
        updateHeader('issM4', `Forecast ${formatMonth(m4)}`);
        updateHeader('m4Po', `PO ${formatMonth(m4)}`);
        updateHeader('m4Request', `PR ${formatMonth(m4)}`);
        updateHeader('m4End', `End ${formatMonth(m4)}`);
        updateHeader('sumAdvOrderQtyM4', `Adv Order ${formatMonth(m4)}`);
        updateHeader('summaryOrderQtyM4', `Summary Order ${formatMonth(m4)}`);
      }
      if (m5) {
        updateHeader('supplyM5', `Total Supply ${formatMonth(m5)}`);
        updateHeader('m5Beg', `Begin ${formatMonth(m5)}`);
        updateHeader('m5Forecast', `Sum ${formatMonth(m5)}`);
        updateHeader('issM5', `Forecast ${formatMonth(m5)}`);
        updateHeader('m5Po', `PO ${formatMonth(m5)}`);
        updateHeader('m5Request', `PR ${formatMonth(m5)}`);
        updateHeader('m5End', `End ${formatMonth(m5)}`);
        updateHeader('sumAdvOrderQtyM5', `Adv Order ${formatMonth(m5)}`);
        updateHeader('summaryOrderQtyM5', `Summary Order ${formatMonth(m5)}`);
      }

      this.purchaseColDefs = updatedColDefs;
      if (this.purchaseGridApi) {
        this.purchaseGridApi.setGridOption('columnDefs', this.purchaseColDefs);
      }
    }

    // Pre-map poData for vendor info
    const poVendorMap = new Map<string, any>();
    poData.forEach(p => {
      const pItem = String(p.ItemNo || p.itemNo || '').trim().toUpperCase();
      if (pItem) poVendorMap.set(pItem, p);
    });

    for (const row of sortedData) {
      if (!row.itemNo && !row.partNo) continue;

      const rItemNo = row.itemNo && row.itemNo !== '-' ? String(row.itemNo).trim() : '-';
      const rPartNo = row.partNo && row.partNo !== '-' ? String(row.partNo).trim() : '-';
      const rProcess = row.process && row.process !== '-' ? String(row.process).trim() : (row.Process ? String(row.Process).trim() : '-');
      const rPosition = row.position && row.position !== '-' ? String(row.position).trim() : (row.Position ? String(row.Position).trim() : '-');

      // Group by ItemNo + PartNo + Process + Position if item_part, otherwise group by ItemNo
      let groupKey = '';
      if (this.itemPartViewMode === 'item_part') {
        groupKey = `${rItemNo}___${rPartNo}___${rProcess}___${rPosition}`;
      } else {
        groupKey = rItemNo !== '-' ? rItemNo : `PART_${rPartNo}`;
      }

      if (!itemMap.has(groupKey)) {
        const rItem = String(row.itemNo).trim().toUpperCase();
        const poItem = poVendorMap.get(rItem);
        const singlePart = (this.itemPartViewMode === 'item_part') ? (rPartNo !== '-' ? rPartNo : '') : '';
        itemMap.set(groupKey, {
          itemNo: row.itemNo === '-' || !row.itemNo ? '-' : row.itemNo,
          name: row.name || (row.partNo ? `Tooling for ${row.partNo}` : ''),
          spec: row.spec || '',
          vendorCode: poItem?.VendorCode || row.vendorCode || '-',
          vendorName: poItem?.VendorName || row.vendorName || '-',
          partNo: singlePart,
          allPartNos: singlePart ? [singlePart] : [],
          allPartNosString: singlePart || '-',
          position: (this.itemPartViewMode === 'item_part') ? (rPosition !== '-' ? rPosition : (row.position || '-')) : (row.position || 'T1'),
          process: (this.itemPartViewMode === 'item_part') ? (rProcess !== '-' ? rProcess : (row.process || '-')) : (row.process || '-'),
          mc: row.mc || row.MC || '-',
          targetMonth: m0,
          qtyMc: 0,
          pastForecast: 0,
          forecastPd: 0,
          m1Forecast: 0,
          m2Forecast: 0,
          m3Forecast: 0,
          m4Forecast: 0,
          m5Forecast: 0,
          usagePcs: row.usagePcs || 0,
          _weightedUsageSum: 0,
          _totalPartQty: 0,
          m0PartQty: 0,
          m1PartQty: 0,
          m2PartQty: 0,
          m3PartQty: 0,
          m4PartQty: 0,
          m5PartQty: 0,
          unitPrice: row.unitPrice || 0
        });
      }

      const group = itemMap.get(groupKey)!;
      group.qtyMc = Math.max(group.qtyMc, (row.mcQty || 0));

      if (!group._partUsageDetails) {
        group._partUsageDetails = new Map<string, { qty: number, usage: number }>();
      }

      const pQty = (row.partQty || 0);
      const uPcs = (row.usagePcs || 0);

      if (row.partNo && row.partNo !== '-') {
        const parts = String(row.partNo).split(',').map((p: string) => p.trim()).filter((p: string) => p);
        for (const pNo of parts) {
           if (!group._partUsageDetails.has(pNo)) {
              group._partUsageDetails.set(pNo, { qty: 0, usage: uPcs });
           }
           if (pQty > 0) {
             group._partUsageDetails.get(pNo)!.qty += pQty;
           }
        }
      }

      if (pQty > 0 && uPcs > 0) {
         group._weightedUsageSum += (pQty * uPcs);
         group._totalPartQty += pQty;
      }
      if (this.itemPartViewMode === 'item_part') {
        if (uPcs > 0) group.usagePcs = uPcs;
      } else {
        group.usagePcs = Math.max(group.usagePcs, uPcs); // Fallback to max if no valid partQty
      }

      const rowM = extractYYYYMM(row.targetMonth);
      if (rowM && rowM < m0) group.pastForecast += (row.reqQty || 0);
      else if (rowM === m0) {
        group.forecastPd += (row.reqQty || 0);
        group.m0PartQty = (group.m0PartQty || 0) + pQty;
      }
      else if (rowM === m1) {
        group.m1Forecast += (row.reqQty || 0);
        group.m1PartQty = (group.m1PartQty || 0) + pQty;
      }
      else if (rowM === m2) {
        group.m2Forecast += (row.reqQty || 0);
        group.m2PartQty = (group.m2PartQty || 0) + pQty;
      }
      else if (rowM === m3) {
        group.m3Forecast += (row.reqQty || 0);
        group.m3PartQty = (group.m3PartQty || 0) + pQty;
      }
      else if (rowM === m4) {
        group.m4Forecast += (row.reqQty || 0);
        group.m4PartQty = (group.m4PartQty || 0) + pQty;
      }
      else if (rowM === m5) {
        group.m5Forecast += (row.reqQty || 0);
        group.m5PartQty = (group.m5PartQty || 0) + pQty;
      }
      else if (!m0) {
        group.forecastPd += (row.reqQty || 0);
        group.m0PartQty = (group.m0PartQty || 0) + pQty;
      }

      // Keep name/spec populated if missing in first row but present later
      if (!group.name && row.name) group.name = row.name;
      if (!group.spec && row.spec) group.spec = row.spec;
      if (this.itemPartViewMode !== 'item_part') {
        if (row.partNo) {
          if (!group._partUsageMap) { group._partUsageMap = {}; }
          const parts = String(row.partNo).split(',').map((p: string) => p.trim()).filter((p: string) => p);
          for (const pNo of parts) {
            group._partUsageMap[pNo] = (group._partUsageMap[pNo] || 0) + (row.reqQty || 1);
          }
        }
      }
      if (!group.vendorCode && row.vendorCode) group.vendorCode = row.vendorCode;
      if (!group.vendorName && row.vendorName) group.vendorName = row.vendorName;
      if ((!group.mc || group.mc === '-') && (row.mc || row.MC)) group.mc = row.mc || row.MC;
      if (!group.position && row.position) group.position = row.position;

      if (row.position && row.position !== '-') {
        if (!group._positions) { group._positions = new Set<string>(); }
        String(row.position).split(',').map((p: string) => p.trim()).filter(Boolean).forEach((p: string) => group._positions.add(p));
      }
      if (row.process && row.process !== '-') {
        if (!group._processes) { group._processes = new Set<string>(); }
        String(row.process).split(',').map((p: string) => p.trim()).filter(Boolean).forEach((p: string) => group._processes.add(p));
      }
    }

    for (const group of itemMap.values()) {
      if (this.itemPartViewMode !== 'item_part') {
        if (group._positions && group._positions.size > 0) {
          group.position = Array.from(group._positions).join(', ');
        }
        if (group._processes && group._processes.size > 0) {
          group.process = Array.from(group._processes).join(', ');
        }
      }
      if (this.itemPartViewMode === 'item_part') {
        group.partNo = group.partNo || '-';
        group.allPartNos = group.partNo && group.partNo !== '-' ? [group.partNo] : [];
        group.allPartNosString = group.partNo;
        const detail = group._partUsageDetails?.get(group.partNo);
        const pQty = group.m0PartQty || (detail ? detail.qty : 0);
        group.partUsageDetailsArray = [{ partNo: group.partNo, qty: pQty, usage: group.usagePcs }];
      } else {
        if (group._partUsageMap) {
          const sortedParts = Object.keys(group._partUsageMap).sort((a, b) => group._partUsageMap[b] - group._partUsageMap[a]);
          const top3 = sortedParts.slice(0, 3);
          group.partNo = top3.join(', ') + (sortedParts.length > 3 ? ' ...' : '');
          group.allPartNos = sortedParts;
          group.allPartNosString = sortedParts.join(', ');
        } else {
          group.partNo = '-';
          group.allPartNos = [];
          group.allPartNosString = '-';
        }

        if (group._totalPartQty > 0) {
          group.usagePcs = Math.round(group._weightedUsageSum / group._totalPartQty);
        }

        group.partUsageDetailsArray = group._partUsageDetails ? Array.from(group._partUsageDetails.entries()).map(([partNo, data]) => ({ partNo, qty: (data as any).qty, usage: (data as any).usage })) : [];
      }
    }

    // 2. Generate Running Balance Data
    const finalData = [];
    const sortedGroupKeys = Array.from(itemMap.keys()).sort();

    // --- Pre-computation to fix O(N*M) bottleneck ---
    const getMonthDict = () => ({ past: 0, m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 });
    const processQtyMap = (dataArray: any[]) => {
      const qtyMap = new Map<string, any>();
      dataArray.forEach(p => {
        const item = String(p.ItemNo || p.itemNo || '').trim().toUpperCase();
        if (!item) return;
        const qty = Number(p.totalQty || p.TotalQty || p.Qty || p.qty || 0);
        const ym = p.targetYear && p.targetMonth ? `${p.targetYear}-${String(p.targetMonth).padStart(2, '0')}` : '';

        if (!qtyMap.has(item)) qtyMap.set(item, getMonthDict());
        const dict = qtyMap.get(item);

        if (ym && ym < m0) dict.past += qty;
        else if (ym === m0) dict.m0 += qty;
        else if (ym === m1) dict.m1 += qty;
        else if (ym === m2) dict.m2 += qty;
        else if (ym === m3) dict.m3 += qty;
        else if (ym === m4) dict.m4 += qty;
        else if (ym === m5) dict.m5 += qty;
        else if (!ym || ym < m0) dict.m0 += qty; // If before m0 or no date, lump into m0
      });
      return qtyMap;
    };

    const poQtyMap = processQtyMap(poData);
    const prQtyMap = processQtyMap(prData);

    const usageMap = new Map<string, any>();
    usageData.forEach(u => {
      const uItem = String(u.itemNo || u.ItemNo || '').trim().toUpperCase();
      if (uItem) {
        usageMap.set(uItem, u);
      }
    });

    const existingRowMap = new Map<string, any>();
    this.purchaseRowData.forEach(r => {
      const item = String(r._realItemNo || r.itemNo || '');
      const part = String(r.partNo || '');
      const proc = String(r.process || '');
      const pos = String(r.position || '');
      existingRowMap.set(`${item}___${part}___${proc}___${pos}`, r);
      existingRowMap.set(`${item}___${part}`, r);
      if (!existingRowMap.has(item)) existingRowMap.set(item, r);
    });
    const stockMap = new Map<string, any>();
    stockData.forEach(s => {
      const sItem = String(s.itemNo || s.ItemNo || '').trim().toUpperCase();
      if (sItem) {
        stockMap.set(sItem, s);
      }
    });

    const dailyIssueMap = new Map<string, number>();
    const dailyIssueDateMap = new Map<string, string>();
    (dailyIssueData || []).forEach(d => {
      const item = String(d.item_no || d.ItemNo || '').trim().toUpperCase();
      if (item) {
        dailyIssueMap.set(item, Number(d.issue_qty || d.quantity || 0));
        const rawDate = d.download_date || d.issue_date || d.date_downloaded || d.last_trans_date;
        if (rawDate) {
          let formatted = String(rawDate).trim();
          if (formatted.includes('-')) {
            const parts = formatted.split('-');
            if (parts.length === 3 && parts[0].length === 4) {
              formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
          }
          dailyIssueDateMap.set(item, formatted);
        }
      }
    });

    const stockSummaryMap = new Map<string, any>();
    (dailyStockSummary || []).forEach((s: any) => {
      const item = String(s.item_no || s.ItemNo || '').trim().toUpperCase();
      if (item) {
        stockSummaryMap.set(item, s);
      }
    });

    const cuttingtoolsInvMap = new Map<string, any>();
    (dailyCuttingtoolsInventory || []).forEach((d: any) => {
      const item = String(d.item_no || d.tooling_name || '').trim().toUpperCase();
      if (item) {
        cuttingtoolsInvMap.set(item, d);
      }
    });
    // ------------------------------------------------

    for (const key of sortedGroupKeys) {
      const g = itemMap.get(key)!;
      const gItemUpper = String(g.itemNo || '').trim().toUpperCase();
      const gPartUpper = String(g.partNo || '').trim().toUpperCase();
      const gMcUpper = String(g.mc || '').trim().toUpperCase();

      const existingRow = existingRowMap.get(`${g.itemNo}___${g.partNo}___${g.process}___${g.position}`) || existingRowMap.get(`${g.itemNo}___${g.partNo}`) || existingRowMap.get(g.itemNo);

      // Get Stock from DB
      const stockInfo = stockMap.get(gItemUpper);
      let stkPd = 0;
      let stkPh = 0;

      if (stockInfo) {
        stkPd = Number(stockInfo.stkPd) || 0;
        stkPh = Number(stockInfo.stkPh) || 0;
      } else if (existingRow) {
        stkPd = Number(existingRow.stkPd) || 0;
        stkPh = Number(existingRow.stkPh) || 0;
      }

      const currentStock = stkPd + stkPh;
      const stockSummaryInfo = stockSummaryMap.get(gItemUpper);
      const receivedQty = stockSummaryInfo ? (Number(stockSummaryInfo.received_qty) || 0) : 0;
      const beginningQty = stockSummaryInfo
        ? (Number(stockSummaryInfo.beginning_qty) || 0)
        : (existingRow ? (Number(existingRow.inventoryPh) || 0) : 0);

      const cuttingtoolsInvInfo = cuttingtoolsInvMap.get(gItemUpper);
      const inventoryPdQty = cuttingtoolsInvInfo
        ? (Number(cuttingtoolsInvInfo.tooling_qty) || 0)
        : (existingRow ? (Number(existingRow.inventoryPd) || 0) : 0);

      // Get PO & PR from pre-computed Map (O(1))
      const poDict = poQtyMap.get(gItemUpper) || { past: 0, m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 };
      const prDict = prQtyMap.get(gItemUpper) || { past: 0, m0: 0, m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 };

      const incomingPo = poDict.m0;
      const m1Po = poDict.m1;
      const m2Po = poDict.m2;
      const m3Po = poDict.m3;
      const m4Po = poDict.m4;
      const m5Po = poDict.m5;

      const pr = prDict.m0;
      const m1Request = prDict.m1;
      const m2Request = prDict.m2;
      const m3Request = prDict.m3;
      const m4Request = prDict.m4;
      const m5Request = prDict.m5;


      let usageItem = usageMap.get(gItemUpper);
      if (!usageItem && gPartUpper) {
        usageItem = usageMap.get(gPartUpper);
      }

      const normalRate = existingRow ? (existingRow.normalRate ?? 120) : 120;
      let achieveRate = 100;
      let advanceAchieveRate = 100;
      let iss: number | null = null;
      let pB = 1;
      let rowBrokenAlert = false;
      let rowBrokenRate = 0;
      let rowIsBroken100 = false;
      let partAdvanceRate: number | null = null;

      if (this.itemPartViewMode === 'item_part' && g.partNo && g.partNo !== '-') {
        if (usageItem) {
          let partAvgData = usageItem.partAvgUsage ? (usageItem.partAvgUsage[g.partNo] || usageItem.partAvgUsage[gPartUpper]) : null;

          if (partAvgData !== null && typeof partAvgData === 'object') {
            iss = partAvgData.avg;
            rowBrokenAlert = partAvgData.alert;
            rowBrokenRate = partAvgData.brokenRate;
            rowIsBroken100 = partAvgData.isBroken100 || (partAvgData.brokenRate === 100);
            partAdvanceRate = partAvgData.advanceAchieveRate;
            pB = partAvgData.pB != null ? partAvgData.pB : (usageItem.pB != null ? usageItem.pB : 1);
          } else if (partAvgData != null) {
            iss = Number(partAvgData);
            pB = usageItem.pB != null ? usageItem.pB : 1;
          } else {
            iss = null;
            pB = usageItem.pB != null ? usageItem.pB : 1;
          }

          // If a row's engineer usagePcs is vastly higher than historical warehouse issue average
          // (e.g. finishing process with 28,000 pcs vs roughing withdrawal avg 672, ratio < 0.2),
          // the historical iss was for the roughing tool, not this finishing tool.
          // Fall back to engineer usagePcs (iss = null) so Achieve Rate is 100%.
          if (iss != null && iss > 0 && g.usagePcs > 0 && (iss / g.usagePcs) < 0.2) {
            iss = null;
          }

          if (g.partUsageDetailsArray && g.partUsageDetailsArray.length > 0) {
            g.partUsageDetailsArray[0].realAvgUsage = iss;
            g.partUsageDetailsArray[0].isFallback = false;
            g.partUsageDetailsArray[0].brokenAlert = rowBrokenAlert;
            g.partUsageDetailsArray[0].brokenRate = rowBrokenRate;
            g.partUsageDetailsArray[0].isBroken100 = rowIsBroken100;
            g.partUsageDetailsArray[0].pB = pB;
          }
        } else {
          iss = null;
          pB = 1;
          if (g.partUsageDetailsArray && g.partUsageDetailsArray.length > 0) {
            g.partUsageDetailsArray[0].realAvgUsage = null;
            g.partUsageDetailsArray[0].pB = 1;
          }
        }
      } else if (usageItem) {
        rowBrokenAlert = usageItem.brokenAlert || false;
        rowBrokenRate = usageItem.brokenRate || 0;
        rowIsBroken100 = usageItem.isBroken100 || (usageItem.brokenRate === 100);

        // Weighted average for iss (Avg Usage) based on active parts
        if (g._partUsageDetails && usageItem.partAvgUsage) {
          let tQty = 0;
          let tWeight = 0;
          for (const [pNo, pData] of g._partUsageDetails.entries()) {
             const qty = (pData as any).qty || 0;
             if (qty > 0) {
                let partAvgData = usageItem.partAvgUsage[pNo];
                // Handle backwards compatibility if it's just a number
                let partAvg = partAvgData;
                let isAlert = false;
                let bRate = 0;
                let isPartBroken100 = false;

                if (partAvgData !== null && typeof partAvgData === 'object') {
                    partAvg = partAvgData.avg;
                    isAlert = partAvgData.alert;
                    bRate = partAvgData.brokenRate;
                    isPartBroken100 = partAvgData.isBroken100 || (partAvgData.brokenRate === 100);
                }

                let isFallback = false;
                if (partAvg == null) {
                   partAvg = (pData as any).usage;
                   isFallback = true;
                }
                if (partAvg != null && partAvg > 0) {
                   tWeight += (qty * partAvg);
                   tQty += qty;
                   const arrItem = g.partUsageDetailsArray?.find((x: any) => x.partNo === pNo);
                   if (arrItem) {
                       arrItem.realAvgUsage = partAvg;
                       arrItem.isFallback = isFallback;
                       arrItem.brokenAlert = isAlert;
                       arrItem.brokenRate = bRate;
                       arrItem.isBroken100 = isPartBroken100;
                   }
                }
             }
          }
          if (tQty > 0) {
            iss = Math.round(tWeight / tQty);
          } else {
            iss = null;
          }
        } else {
          iss = null;
        }

        pB = usageItem.pB != null ? usageItem.pB : 1;
      }

      // New Logic: Achieve Rate = (Avg Usage / CRN) * 100
      const currentCrn = g.usagePcs || (existingRow ? existingRow.usagePcs : 0) || 0;
      if (rowIsBroken100) {
        achieveRate = 100;
        advanceAchieveRate = 100;
      } else if (iss != null && iss > 0 && currentCrn > 0) {
        achieveRate = (currentCrn > 0) ? ((iss / currentCrn) * 100) : (usageItem.achieveRate || 0);
        achieveRate = Math.round(achieveRate * 100) / 100;

        advanceAchieveRate = Math.round(((pB != null ? pB : 1) * achieveRate) * 100) / 100;
      } else if (existingRow) {
        achieveRate = existingRow.achieveRate ?? 100;
        advanceAchieveRate = Math.round(((pB != null ? pB : 1) * achieveRate) * 100) / 100;
      } else {
        achieveRate = 100;
        advanceAchieveRate = Math.round(((pB != null ? pB : 1) * achieveRate) * 100) / 100;
      }

      const lt = existingRow ? (existingRow.lt ?? 90) : 90;

      const normalRateM1 = existingRow ? (existingRow.normalRateM1 ?? normalRate) : normalRate;
      const normalRateM2 = existingRow ? (existingRow.normalRateM2 ?? normalRate) : normalRate;
      const normalRateM3 = existingRow ? (existingRow.normalRateM3 ?? normalRate) : normalRate;
      const normalRateM4 = existingRow ? (existingRow.normalRateM4 ?? normalRate) : normalRate;
      const normalRateM5 = existingRow ? (existingRow.normalRateM5 ?? normalRate) : normalRate;

      const calcOrderRate = (nRate: number, advRate: number) => {
        if (advRate >= 100) return Math.round(nRate * 100) / 100;
        if (advRate <= 0) return 0;
        return Math.round((nRate / (advRate / 100)) * 100) / 100;
      };

      const orderRate = calcOrderRate(normalRate, advanceAchieveRate);
      const orderRateM1 = calcOrderRate(normalRateM1, advanceAchieveRate);
      const orderRateM2 = calcOrderRate(normalRateM2, advanceAchieveRate);
      const orderRateM3 = calcOrderRate(normalRateM3, advanceAchieveRate);
      const orderRateM4 = calcOrderRate(normalRateM4, advanceAchieveRate);
      const orderRateM5 = calcOrderRate(normalRateM5, advanceAchieveRate);

      const calculation = orderRate;

      // Calculate M0 Begin: strictly Stock PD + Stock PH as requested
      const beg = currentStock;

      const planSetup = Math.ceil(g.forecastPd * (orderRate / 100));
      const issM1 = Math.ceil(g.m1Forecast * (orderRateM1 / 100));
      const issM2 = Math.ceil(g.m2Forecast * (orderRateM2 / 100));
      const issM3 = Math.ceil(g.m3Forecast * (orderRateM3 / 100));
      const issM4 = Math.ceil(g.m4Forecast * (orderRateM4 / 100));
      const issM5 = Math.ceil(g.m5Forecast * (orderRateM5 / 100));

      // Monthly view concept: Inventory PD + Inventory PH + Receive + PO + PR = total, total - forecast = end
      const monthlyTotal = (inventoryPdQty + beginningQty) + receivedQty + incomingPo + pr;
      const end = monthlyTotal - planSetup;
      const m1End = end + m1Po + m1Request - issM1;
      const m2End = m1End + m2Po + m2Request - issM2;
      const m3End = m2End + m3Po + m3Request - issM3;
      const m4End = m3End + m4Po + m4Request - issM4;
      const m5End = m4End + m5Po + m5Request - issM5;

      let targetDailyForecast = planSetup;
      let targetDailyPo = incomingPo;
      let targetDailyPr = pr;
      if (this.selectedDailyForecastMonthOffset === 1) {
        targetDailyForecast = issM1;
        targetDailyPo = m1Po;
        targetDailyPr = m1Request;
      } else if (this.selectedDailyForecastMonthOffset === 2) {
        targetDailyForecast = issM2;
        targetDailyPo = m2Po;
        targetDailyPr = m2Request;
      } else if (this.selectedDailyForecastMonthOffset === 3) {
        targetDailyForecast = issM3;
        targetDailyPo = m3Po;
        targetDailyPr = m3Request;
      } else if (this.selectedDailyForecastMonthOffset === 4) {
        targetDailyForecast = issM4;
        targetDailyPo = m4Po;
        targetDailyPr = m4Request;
      } else if (this.selectedDailyForecastMonthOffset === 5) {
        targetDailyForecast = issM5;
        targetDailyPo = m5Po;
        targetDailyPr = m5Request;
      }
      const dailyTotalSupply = currentStock + (Number(targetDailyPo) || 0) + (Number(targetDailyPr) || 0);
      const balanceIssue = (targetDailyForecast || 0) - (dailyIssueMap.get(gItemUpper) || 0);

      const newRow: any = {
        id: (this.itemPartViewMode === 'item_part')
          ? `${g.itemNo}___${g.partNo}___${g.process}___${g.position}`
          : `${g.itemNo}___${g.partNo}`,
        itemNo: g.itemNo,
        _realItemNo: g.itemNo,
        name: g.name,
        spec: g.spec,
        vendorCode: g.vendorCode,
        vendorName: g.vendorName,
        partNo: g.partNo,
        allPartNos: g.allPartNos || [],
        allPartNosString: g.allPartNosString || g.partNo || '',
        partUsageDetailsArray: g.partUsageDetailsArray ? g.partUsageDetailsArray.map((x: any) => ({ ...x })) : [],
        position: g.position,
        positionCount: (this.itemPartViewMode === 'item_part') ? 1 : ((g._positions && g._positions.size > 0) ? g._positions.size : 1),
        process: g.process,
        mc: g.mc,
        targetMonth: g.targetMonth,
        qtyMc: g.qtyMc,
        usagePcs: g.usagePcs,
        partQty: g.m0PartQty || 0,
        totalPartQty: g._totalPartQty || 0,
        m0PartQty: g.m0PartQty || 0,
        m1PartQty: g.m1PartQty || 0,
        m2PartQty: g.m2PartQty || 0,
        m3PartQty: g.m3PartQty || 0,
        m4PartQty: g.m4PartQty || 0,
        m5PartQty: g.m5PartQty || 0,
        advOrderQty: 0,
        advOrderQtyM1: 0,
        advOrderQtyM2: 0,
        advOrderQtyM3: 0,
        advOrderQtyM4: 0,
        advOrderQtyM5: 0,

        forecastPd: g.forecastPd,
        m1Forecast: g.m1Forecast,
        m2Forecast: g.m2Forecast,
        m3Forecast: g.m3Forecast,
        m4Forecast: g.m4Forecast,
        m5Forecast: g.m5Forecast,

        unitPrice: g.unitPrice,
        amount: g.unitPrice * planSetup,
        normalRate: normalRate,
        normalRateM1: normalRateM1,
        normalRateM2: normalRateM2,
        normalRateM3: normalRateM3,
        normalRateM4: normalRateM4,
        normalRateM5: normalRateM5,
        achieveRate: achieveRate,
        advanceAchieveRate: advanceAchieveRate,
        pB: pB,
        brokenAlert: rowBrokenAlert,
        brokenRate: rowBrokenRate,
        isBroken100: rowIsBroken100,
        _dbAchieveRateRaw: usageItem ? usageItem.achieveRate : null,
        _dbAvgUsageRaw: usageItem ? usageItem.avgUsage : null,
        orderRate: orderRate,
        orderRateM1: orderRateM1,
        orderRateM2: orderRateM2,
        orderRateM3: orderRateM3,
        orderRateM4: orderRateM4,
        orderRateM5: orderRateM5,
        calculation: calculation,
        iss: iss,
        planSetup: planSetup,
        issM1: issM1,
        issM2: issM2,
        issM3: issM3,
        issM4: issM4,
        issM5: issM5,
        lt: lt,

        stkPd: stkPd,
        stkPh: stkPh,
        inventoryPd: inventoryPdQty,
        inventoryPh: beginningQty,
        sumInventory: inventoryPdQty + beginningQty,
        currentStock: currentStock,
        beg: beg,
        receive: receivedQty,

        // Daily Monitor
        issue: dailyIssueMap.get(gItemUpper) || 0,
        dailyTotalSupply: dailyTotalSupply,
        balanceIssue: balanceIssue,
        stockOnHand: currentStock,
        blUseMonth: dailyTotalSupply - balanceIssue,
        issueDate: (dailyIssueMap.get(gItemUpper) || 0) > 0 ? (dailyIssueDateMap.get(gItemUpper) || '-') : '-',

        pr: pr,
        in: incomingPo,
        m1Po: m1Po,
        m2Po: m2Po,
        m3Po: m3Po,
        m4Po: m4Po,
        m5Po: m5Po,

        totalSupply: monthlyTotal,
        total: monthlyTotal,
        end: end,
        m1Beg: end,
        m1End: m1End,
        m2Beg: m1End,
        m2End: m2End,
        m3Beg: m2End,
        m3End: m3End,
        m4Beg: m3End,
        m4End: m4End,
        m5Beg: m4End,
        m5End: m5End,

        m1Request: m1Request,
        m2Request: m2Request,
        m3Request: m3Request,
        m4Request: m4Request,
        m5Request: m5Request
      };

      const orderPlan = this.calculateOrderPlan(newRow);
      Object.assign(newRow, orderPlan);

      finalData.push(newRow);
    }

    this.allPurchaseRowData = finalData;
    this.purchaseRowData = finalData;
    this.availableVendors = Array.from(new Set(finalData.map(d => d.vendorName).filter(v => v))).sort() as string[];
    this.selectedVendor = 'All Vendors';

    if (this.purchaseGridApi) {
      if (this.purchaseViewMode === 'parameters') {
        this.purchaseGridApi.setGridOption('rowData', finalData);
      } else {
        this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
        this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
      }
      this.purchaseGridApi.onFilterChanged();
    }
    this.applyViewModeColumns();
    // We rely on recalculateTotals() triggered by filterChanged event
    this.cdr.detectChanges();
  }

  // Handle cell edits (recalculate running balance dynamically)
  onPurchaseCellValueChanged(event: any) {
    const fields = ['in', 'm1Po', 'm2Po', 'm3Po', 'm4Po', 'm5Po', 'stkPd', 'stkPh', 'pr', 'm1Request', 'm2Request', 'm3Request', 'm4Request', 'm5Request', 'normalRate', 'normalRateM1', 'normalRateM2', 'normalRateM3', 'normalRateM4', 'normalRateM5', 'achieveRate', 'lt', 'confirmQty', 'unitPrice'];
    if (fields.includes(event.colDef.field)) {
      const updatedData = [...this.purchaseRowData];
      const editedItemNo = event.data._realItemNo || event.data.itemNo;
      const editedRowId = event.data.id || `${editedItemNo}___${event.data.partNo || ''}___${event.data.process || ''}___${event.data.position || ''}`;
      const isPartSpecificField = ['normalRate', 'normalRateM1', 'normalRateM2', 'normalRateM3', 'normalRateM4', 'normalRateM5', 'achieveRate', 'confirmQty'].includes(event.colDef.field);

      if (event.colDef.field === 'confirmQty') {
        const key = `${String(editedItemNo).trim().toUpperCase()}_${this.targetOrderMonthOffset || 0}`;
        this.manualConfirmQtyMap[key] = event.newValue;
      }

      for (let i = 0; i < updatedData.length; i++) {
        const currentRowId = updatedData[i].id || `${updatedData[i]._realItemNo || updatedData[i].itemNo}___${updatedData[i].partNo || ''}___${updatedData[i].process || ''}___${updatedData[i].position || ''}`;
        const matches = (this.purchaseViewMode === 'parameters' && isPartSpecificField)
          ? (currentRowId === editedRowId)
          : ((updatedData[i]._realItemNo || updatedData[i].itemNo) === editedItemNo);
        if (matches) {
          const row = { ...updatedData[i] };

          const field = event.colDef.field;
          const newVal = Number(event.newValue) || 0;
          if (field === 'normalRate') {
            const m = this.selectedRateMonth;
            if (m === 'M1') row.normalRateM1 = newVal;
            else if (m === 'M2') row.normalRateM2 = newVal;
            else if (m === 'M3') row.normalRateM3 = newVal;
            else if (m === 'M4') row.normalRateM4 = newVal;
            else if (m === 'M5') row.normalRateM5 = newVal;
            else row.normalRate = newVal;
          } else if (field.startsWith('normalRate')) {
            row[field] = newVal;
          } else if (field === 'achieveRate') {
            row.achieveRate = newVal;
          } else if (field === 'confirmQty') {
            row.confirmQty = newVal;
          } else {
            row[field] = newVal;
          }

          row.stkPd = Number(row.stkPd) || 0;
          row.stkPh = Number(row.stkPh) || 0;
          row.currentStock = row.stkPd + row.stkPh;
          row.beg = row.currentStock;

          row.in = Number(row.in) || 0;
          row.pr = Number(row.pr) || 0;
          row.m1Po = Number(row.m1Po) || 0;
          row.m2Po = Number(row.m2Po) || 0;
          row.m3Po = Number(row.m3Po) || 0;
          row.m4Po = Number(row.m4Po) || 0;
          row.m5Po = Number(row.m5Po) || 0;

          row.normalRate = Number(row.normalRate) || 0;
          row.normalRateM1 = Number(row.normalRateM1 ?? row.normalRate) || 0;
          row.normalRateM2 = Number(row.normalRateM2 ?? row.normalRate) || 0;
          row.normalRateM3 = Number(row.normalRateM3 ?? row.normalRate) || 0;
          row.normalRateM4 = Number(row.normalRateM4 ?? row.normalRate) || 0;
          row.normalRateM5 = Number(row.normalRateM5 ?? row.normalRate) || 0;

          row.achieveRate = Number(row.achieveRate) || 100;
          if (row.achieveRate <= 0) row.achieveRate = 100;
          row.advanceAchieveRate = Math.round(((row.pB != null ? row.pB : 1) * row.achieveRate) * 100) / 100;

          const calcOrderRate = (nRate: number, advRate: number) => {
            if (advRate >= 100) return Math.round(nRate * 100) / 100;
            if (advRate <= 0) return 0;
            return Math.round((nRate / (advRate / 100)) * 100) / 100;
          };

          const advRate = row.advanceAchieveRate != null ? row.advanceAchieveRate : (row.achieveRate ?? 100);
          row.orderRate = calcOrderRate(row.normalRate, advRate);
          row.orderRateM1 = calcOrderRate(row.normalRateM1, advRate);
          row.orderRateM2 = calcOrderRate(row.normalRateM2, advRate);
          row.orderRateM3 = calcOrderRate(row.normalRateM3, advRate);
          row.orderRateM4 = calcOrderRate(row.normalRateM4, advRate);
          row.orderRateM5 = calcOrderRate(row.normalRateM5, advRate);
          row.calculation = row.orderRate;

          const issM0 = Math.ceil((row.forecastPd || 0) * (row.orderRate / 100));
          const issM1 = Math.ceil((row.m1Forecast || 0) * (row.orderRateM1 / 100));
          const issM2 = Math.ceil((row.m2Forecast || 0) * (row.orderRateM2 / 100));
          const issM3 = Math.ceil((row.m3Forecast || 0) * (row.orderRateM3 / 100));
          const issM4 = Math.ceil((row.m4Forecast || 0) * (row.orderRateM4 / 100));
          const issM5 = Math.ceil((row.m5Forecast || 0) * (row.orderRateM5 / 100));

          row.planSetup = issM0;
          row.issM1 = issM1;
          row.issM2 = issM2;
          row.issM3 = issM3;
          row.issM4 = issM4;
          row.issM5 = issM5;

          const invPd = Number(row.inventoryPd) || 0;
          const invPh = Number(row.inventoryPh) || 0;
          const rcv = Number(row.receive) || 0;
          const po = Number(row.in) || 0;
          const pr = Number(row.pr) || 0;
          row.totalSupply = invPd + invPh + rcv + po + pr;
          row.total = row.totalSupply;
          row.end = row.totalSupply - issM0;
          row.m1Beg = row.end;
          row.m1End = row.m1Beg + row.m1Po + (Number(row.m1Request) || 0) - issM1;
          row.m2Beg = row.m1End;
          row.m2End = row.m2Beg + row.m2Po + (Number(row.m2Request) || 0) - issM2;
          row.m3Beg = row.m2End;
          row.m3End = row.m3Beg + row.m3Po + (Number(row.m3Request) || 0) - issM3;
          row.m4Beg = row.m3End;
          row.m4End = row.m4Beg + row.m4Po + (Number(row.m4Request) || 0) - issM4;
          row.m5Beg = row.m4End;
          row.m5End = row.m5Beg + row.m5Po + (Number(row.m5Request) || 0) - issM5;

          row.lt = Number(row.lt) || 0;

          // Daily Monitor
          row.issue = Number(row.issue) || 0;
          let targetDailyForecast = row.planSetup;
          let targetPo = row.in;
          let targetPr = row.pr;
          if (this.selectedDailyForecastMonthOffset === 1) { targetDailyForecast = row.issM1; targetPo = row.m1Po; targetPr = row.m1Request; }
          else if (this.selectedDailyForecastMonthOffset === 2) { targetDailyForecast = row.issM2; targetPo = row.m2Po; targetPr = row.m2Request; }
          else if (this.selectedDailyForecastMonthOffset === 3) { targetDailyForecast = row.issM3; targetPo = row.m3Po; targetPr = row.m3Request; }
          else if (this.selectedDailyForecastMonthOffset === 4) { targetDailyForecast = row.issM4; targetPo = row.m4Po; targetPr = row.m4Request; }
          else if (this.selectedDailyForecastMonthOffset === 5) { targetDailyForecast = row.issM5; targetPo = row.m5Po; targetPr = row.m5Request; }

          row.stockOnHand = Number(row.currentStock) || (row.stkPd + row.stkPh) || 0;
          row.dailyTotalSupply = row.stockOnHand + (Number(targetPo) || 0) + (Number(targetPr) || 0);
          row.balanceIssue = (targetDailyForecast || 0) - row.issue;
          row.blUseMonth = row.dailyTotalSupply - row.balanceIssue;

          const orderPlan = this.calculateOrderPlan(row);
          Object.assign(row, orderPlan);
          updatedData[i] = row;

          if (event.colDef.field && event.colDef.field.startsWith('normalRate') && this.purchaseViewMode === 'parameters') {
            this.purchaseGridApi.applyTransaction({ update: [row] });
            this.purchaseGridApi.refreshCells({ rowNodes: [event.node], force: true });
          }
        }
      }

      this.purchaseRowData = updatedData;
      if (this.purchaseViewMode === 'parameters') {
        if (!event.colDef.field?.startsWith('normalRate')) {
          this.purchaseGridApi.setGridOption('rowData', updatedData);
        }
      } else {
        this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
        if (this.purchaseGridApi) {
          this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
        }
      }
      this.cdr.detectChanges();
    }
  }

  saveForecastToDB() {
    if (!this.forecastRowData || this.forecastRowData.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No Data',
        text: 'Please import and calculate the forecast first.',
        confirmButtonText: 'OK'
      });
      return;
    }

    if (!this.selectedMonth || !this.selectedYear || !this.selectedRevision) {
      Swal.fire({
        icon: 'error',
        title: 'Missing Headers',
        text: 'Please ensure Month, Year, and Revision are selected.',
        confirmButtonText: 'OK'
      });
      return;
    }

    const payload = {
      month: this.selectedMonth,
      year: this.selectedYear,
      revision: this.selectedRevision,
      createdBy: this.Employee_Name || this.role || 'System',
      data: this.forecastRowData
    };

    Swal.fire({
      title: 'Saving to Database...',
      text: `Saving plan for ${this.selectedMonth} ${this.selectedYear} (${this.selectedRevision})`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.forecastService.savePCPlan(payload).subscribe({
      next: (res) => {
        Swal.fire({
          icon: 'success',
          title: 'Save Successful!',
          text: `Saved ${res.count} items to ForecastProject Database.`,
          timer: 2000,
          showConfirmButton: false
        });
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Save Failed',
          text: `Could not save to Database: ${err.error?.error || err.message}`,
          confirmButtonText: 'OK'
        });
      }
    });
  }

  exportPurchaseExcel() {
    console.log('Exporting Purchase Excel');
  }

  exportForecastReport() {
    console.log('Exporting Purchase Excel');
  }

  // --- Master Calculation Engine ---
  calculateForecast(orders: any[], inventoryData?: any[], usageData?: any[]): any[] {
    // --- Pre-computation to fix O(N*M) bottleneck ---
    const usageMap = new Map<string, any>();
    if (usageData) {
      usageData.forEach(u => {
        const uItem = String(u.itemNo || u.ItemNo || '').trim().toUpperCase();
        if (uItem) {
          usageMap.set(uItem, u);
        }
      });
    }

    const inventoryMap = new Map<string, any>();
    if (inventoryData) {
      inventoryData.forEach(i => {
        const iItem = String(i.itemNo || '').trim().toUpperCase();
        if (iItem) inventoryMap.set(iItem, i);
      });
    }
    // ------------------------------------------------

    const result = orders.map((ord, idx) => {
      const ctSec          = ord.ctSec   || 0;
      let working        = ord.working || 22;
        if (!working || working <= 0 || isNaN(working)) working = 22;
      const partQty        = ord.partQty || 0;
      const crn            = ord.usagePcs ?? 0;

      // Calculate real Achieve Rate: (Avg Usage / CRN) * 100
      let achieveRate = 100;
      let advanceAchieveRate = 100;
      let pB = 1;
      if (usageData) {
        const oItem = String(ord.itemNo || '').trim().toUpperCase();
        const oPart = String(ord.partNo || '').trim().toUpperCase();
        let u = usageMap.get(oItem);
        if (!u && oPart) {
          u = usageMap.get(oPart);
        }
        if (u && u.avgUsage != null && crn > 0 && u.avgUsage > 0) {
          let specificAvgUsage = u.avgUsage;
          let partPData = (u.partAvgUsage && (u.partAvgUsage[ord.partNo] || u.partAvgUsage[oPart])) || null;
          if (partPData) {
            specificAvgUsage = typeof partPData === 'object' ? (partPData.avg ?? specificAvgUsage) : partPData;
            pB = typeof partPData === 'object' && partPData.pB != null ? partPData.pB : (u.pB != null ? u.pB : 1);
          } else {
            pB = u.pB != null ? u.pB : 1;
          }

          achieveRate = (specificAvgUsage != null && crn > 0) ? ((specificAvgUsage / crn) * 100) : (u.achieveRate || 0);
          achieveRate = Math.round(achieveRate * 100) / 100;

          advanceAchieveRate = Math.round(((pB != null ? pB : 1) * achieveRate) * 100) / 100;
        } else if (u && u.achieveRate != null) {
          achieveRate = u.achieveRate;
          pB = u.pB != null ? u.pB : 1;
          advanceAchieveRate = Math.round((pB * achieveRate) * 100) / 100;
        }
      }

      // Always compute mcQty
        const capacityPerDay = ctSec > 0 ? (3600 / ctSec) * 24 * 0.9 : 0;
        let computedMcQty = capacityPerDay > 0 ? Math.ceil((partQty / working) / capacityPerDay) : 0;
        if (computedMcQty <= 0 && partQty > 0) computedMcQty = 1;

        const mcQty = computedMcQty; // Re-enabled for display

        // Calculate raw usage based on tool life (CRN) without achieve rate multiplier
        // Also multiply by Tool Use/Pos (initialItemQty) to account for multiple positions
        let reqQty = 0;
        if (crn > 0) {
          reqQty = Math.ceil(partQty / crn) * (ord.initialItemQty || 1);
        } else {
          // Fallback if CRN is 0
          reqQty = Math.max(mcQty, ord.initialItemQty || 0);
        }

      const oItemPrice = String(ord.itemNo || '').trim().toUpperCase();
      const invItem = inventoryMap.get(oItemPrice);
      const unitPrice = ord.unitPrice || (invItem ? (invItem.unitPrice ?? 0) : 0);

      const amount = reqQty * unitPrice;

      return {
        ...ord,
        no: idx + 1,
        partNo: ord.partNo || '-',
        itemNo: ord.itemNo || `TL-${1000 + idx}`,
        position: ord.position || '-',
        mcQty,
        usagePcs: crn,
        reqQty,
        unitPrice,
        amount,
        achieveRate,
        advanceAchieveRate,
        pB
      };
    });

    result.sort((a, b) => {
      const pA = a.partNo || '';
      const pB = b.partNo || '';
      if (pA !== pB) return pA < pB ? -1 : 1;

      const mcA = a.mc || '';
      const mcB = b.mc || '';
      if (mcA !== mcB) return mcA < mcB ? -1 : 1;
      return 0;
    });

    let currentGroupKey: string | null = null;
    result.forEach((row, idx) => {
      const groupKey = row.partNo + '_' + row.mc;
      row.no = idx + 1;
      if (groupKey !== currentGroupKey) {
        currentGroupKey = groupKey;
        row.isFirstInGroup = true;
      } else {
        row.isFirstInGroup = false;
      }
    });

    return result;
  }

  generateForecast() {
    Swal.fire({
      title: 'Generating Forecast...',
      html: `Computing tooling request plan for <b>${this.selectedMonth} ${this.selectedYear}</b> (${this.selectedRevision})`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    if (this.dbConnected === true) {
      forkJoin({
        orders: this.forecastService.getOrders(),
        usageData: this.forecastService.getToolingUsageParameters()
      }).subscribe({
        next: (res) => {
          const orders = res.orders;
          const usageData = res.usageData;

          const enrichedOrders = orders.map((ord, idx) => ({
            ...ord,
            working: ord.working || 22,
            ctSec: ord.ctSec || 5,
            usagePcs: ord.usagePcs || 120000, // Default CRN
            itemNo: ord.itemNo || '-',
            partQty: ord.partQty || 10000
          }));

          const calculatedForecast = this.calculateForecast(enrichedOrders, [], usageData);
          const finalData = calculatedForecast.map(d => ({
            ...d,
            name: d.name || `Tooling for ${d.itemNo || d.partNo}`
          }));

            const payload = {
            month: this.selectedMonth,
            year: this.selectedYear,
            revision: this.selectedRevision,
            data: finalData
          };

          // Save generated forecast to PBGM8G CostReduction database
          this.forecastService.submitForecast(payload).subscribe({
            next: (res) => {
              // --- PROTOTYPE MODE: Also save to LocalStorage ---
              const storageKey = `FORECAST_${this.selectedMonth}_${this.selectedYear}_${this.selectedRevision}`;
              try { localStorage.setItem(storageKey, JSON.stringify(finalData)); } catch (e) { console.warn('LocalStorage save failed:', e); }

              this.forecastRowData = this.processGridData(finalData);
              Swal.close();
              Swal.fire({
                icon: 'success',
                title: 'Forecast Generated!',
                text: `Forecast planning data calculated and saved to PBGM8G server (${res.count} items). LocalStorage also updated.`,
                confirmButtonText: 'Confirm',
                customClass: {
                  confirmButton: 'btn btn-success'
                }
              });
            },
            error: (err) => {
              Swal.close();
              Swal.fire({
                icon: 'error',
                title: 'Generation Failed',
                text: `Could not save forecast: ${err.error?.error || err.message}`,
                confirmButtonText: 'OK'
              });
            }
          });
        },
        error: (err) => {
          Swal.close();
          Swal.fire({
            icon: 'error',
            title: 'Query Failed',
            text: `Could not load orders to compute: ${err.error?.error || err.message}`,
            confirmButtonText: 'OK'
          });
        }
      });
    } else {
      // Offline/Simulation Mode: Calculate locally using mock data
      setTimeout(() => {
        const mockOrders = [
          { orderId: 'ORD-2026-001', itemNo: 'TL-8891', partNo: 'P-55667', name: 'Punch Die-A (Mock)', partQty: 1200000, working: 22, ctSec: 4.5, process: 'Stamping', mc: 'MC-STAMP-01' },
          { orderId: 'ORD-2026-002', itemNo: 'TL-4432', partNo: 'P-55668', name: 'Guide Pin 12mm (Mock)', partQty: 2500000, working: 20, ctSec: 2.8, process: 'Injection', mc: 'MC-MOLD-09' },
          { orderId: 'ORD-2026-003', itemNo: 'TL-5510', name: 'Stripper Plate B (Mock)', partQty: 80000, working: 25, ctSec: 8.0, process: 'Assembly', mc: 'MC-ASSY-02' }
        ];

        const mockInventory = [
          { itemNo: 'TL-8891', onHand: 1, po: 1, pr: 0, unitPrice: 5000 },
          { itemNo: 'TL-4432', onHand: 5, po: 2, pr: 1, unitPrice: 400 },
          { itemNo: 'TL-5510', onHand: 2, po: 0, pr: 1, unitPrice: 22500 }
        ];

        const calculatedData = this.calculateForecast(mockOrders, mockInventory);

        // Map names & tooling fields
        const finalData = calculatedData.map(d => ({
          ...d,
          name: d.name || `Tooling for ${d.itemNo}`
        }));

        // --- PROTOTYPE MODE: Save to LocalStorage ---
        const storageKey = `FORECAST_${this.selectedMonth}_${this.selectedYear}_${this.selectedRevision}`;
        try { localStorage.setItem(storageKey, JSON.stringify(finalData)); } catch (e) { console.warn('LocalStorage save failed:', e); }

        this.forecastRowData = finalData;
        Swal.close();
        Swal.fire({
          icon: 'warning',
          title: 'Simulation Mode (Offline)',
          text: `Calculated ${finalData.length} items using local mock orders & inventory because database is offline. Data saved to LocalStorage.`,
          confirmButtonText: 'OK'
        });
      }, 800);
    }
  }
  processGridData(data: any[]): any[] {
    if (!data || data.length === 0) return [];

    // Precompute targetMonth timestamp for faster sorting
    const dataWithTimestamp = data.map(r => ({ ...r, _targetTime: new Date(r.targetMonth || 0).getTime() }));

    // Sort by TargetMonth (chronologically) then by PartNo
    const sortedData = dataWithTimestamp.sort((a, b) => {
      if (a._targetTime !== b._targetTime) {
        return a._targetTime - b._targetTime;
      }

      const pA = a.partNo || '';
      const pB = b.partNo || '';
      return pA < pB ? -1 : (pA > pB ? 1 : 0);
    });

    let currentKey = '';
    let groupIndex = -1;
    return sortedData.map((row, index) => {
      const key = `${row.targetMonth}_${row.partNo}`;
      const isFirst = key !== currentKey;
      if (isFirst) {
        currentKey = key;
        groupIndex++;
      }
      return {
        ...row,
        no: index + 1,
        isFirstInGroup: isFirst,
        partGroupIndex: groupIndex
      };
    });
  }

  calcAdvOrderQty(row: any, offset: number = 0): number {
    if (!row) return 0;
    let pQty = 0;
    let forecastQty = 0;

    if (offset === 0) {
      pQty = (row.m0PartQty != null && Number(row.m0PartQty) > 0)
        ? Number(row.m0PartQty)
        : (Number(row.partQty) || 0);
      forecastQty = Number(row.forecastPd) || 0;
    } else if (offset === 1) {
      pQty = Number(row.m1PartQty) || 0;
      forecastQty = Number(row.m1Forecast) || 0;
    } else if (offset === 2) {
      pQty = Number(row.m2PartQty) || 0;
      forecastQty = Number(row.m2Forecast) || 0;
    } else if (offset === 3) {
      pQty = Number(row.m3PartQty) || 0;
      forecastQty = Number(row.m3Forecast) || 0;
    } else if (offset === 4) {
      pQty = Number(row.m4PartQty) || 0;
      forecastQty = Number(row.m4Forecast) || 0;
    } else if (offset === 5) {
      pQty = Number(row.m5PartQty) || 0;
      forecastQty = Number(row.m5Forecast) || 0;
    }

    const posCount = row.positionCount || (row.position && row.position !== '-' ? String(row.position).split(',').map((p: string) => p.trim()).filter(Boolean).length : 1) || 1;
    const pQtyPerPos = posCount > 1 ? (pQty / posCount) : pQty;

    const usedAvg = (row.iss != null && Number(row.iss) > 0) ? Number(row.iss) : (Number(row.usagePcs) || 0);
    const advRate = (row.advanceAchieveRate != null ? Number(row.advanceAchieveRate) : 100) / 100;
    const pB = (row.pB != null && Number(row.pB) > 0) ? Number(row.pB) : 1;
    const effectiveUsage = (row.iss != null && Number(row.iss) > 0)
      ? Number(row.iss) * pB
      : (Number(row.usagePcs) || 0) * (advRate > 0 ? advRate : 1);

    if (effectiveUsage > 0 && pQty > 0) {
      return Math.ceil(pQtyPerPos / effectiveUsage) * posCount;
    } else if (usedAvg > 0 && pQty > 0) {
      return Math.ceil(pQtyPerPos / usedAvg) * posCount;
    } else if (forecastQty > 0) {
      const forecastPerPos = posCount > 1 ? (forecastQty / posCount) : forecastQty;
      return Math.ceil(forecastPerPos / (advRate > 0 ? advRate : 1)) * posCount;
    }
    return 0;
  }

  buildSummaryOrdersRowData(): any[] {
    try {
      const map = new Map<string, any>();
      const sourceData = (this.purchaseRowData && this.purchaseRowData.length > 0)
        ? this.purchaseRowData
        : (this.allPurchaseRowData || []);

      for (const row of sourceData) {
        if (!row) continue;
        const rawItemNo = row._realItemNo || row.itemNo;
        const itemKey = String(rawItemNo || '').trim().toUpperCase();
        if (!itemKey || itemKey === '-' || itemKey === '0' || itemKey === 'UNDEFINED' || itemKey === 'NULL') continue;
        if (!this.showMissingItemNo && itemKey.startsWith('NO MASTER')) continue;

        const advQty0 = Number(row.advOrderQty) || this.calcAdvOrderQty(row, 0) || 0;
        const advQtyM1 = Number(row.advOrderQtyM1) || this.calcAdvOrderQty(row, 1) || 0;
        const advQtyM2 = Number(row.advOrderQtyM2) || this.calcAdvOrderQty(row, 2) || 0;
        const advQtyM3 = Number(row.advOrderQtyM3) || this.calcAdvOrderQty(row, 3) || 0;
        const advQtyM4 = Number(row.advOrderQtyM4) || this.calcAdvOrderQty(row, 4) || 0;
        const advQtyM5 = Number(row.advOrderQtyM5) || this.calcAdvOrderQty(row, 5) || 0;

        const nRate0 = Number(row.normalRate) || 120;
        const nRateM1 = Number(row.normalRateM1 ?? row.normalRate) || 120;
        const nRateM2 = Number(row.normalRateM2 ?? row.normalRate) || 120;
        const nRateM3 = Number(row.normalRateM3 ?? row.normalRate) || 120;
        const nRateM4 = Number(row.normalRateM4 ?? row.normalRate) || 120;
        const nRateM5 = Number(row.normalRateM5 ?? row.normalRate) || 120;

        const oRate0 = Number(row.orderRate) || nRate0;
        const oRateM1 = Number(row.orderRateM1) || nRateM1;
        const oRateM2 = Number(row.orderRateM2) || nRateM2;
        const oRateM3 = Number(row.orderRateM3) || nRateM3;
        const oRateM4 = Number(row.orderRateM4) || nRateM4;
        const oRateM5 = Number(row.orderRateM5) || nRateM5;

        if (!map.has(itemKey)) {
          map.set(itemKey, {
            id: `summary___${itemKey}`,
            itemNo: row.itemNo || row._realItemNo || itemKey,
            _realItemNo: row._realItemNo || row.itemNo || itemKey,
            name: row.name || '-',
            spec: row.spec || '-',
            partNo: row.partNo || '',
            allPartNos: [] as string[],
            allPartNosString: '',
            partUsageDetailsArray: [] as any[],
            brokenAlert: false,
            brokenRate: 0,
            isBroken100: false,
            vendorCode: row.vendorCode || '',
            vendorName: row.vendorName || '',
            unitPrice: Number(row.unitPrice) || 0,
            targetMonth: row.targetMonth || '',
            lt: Number(row.lt) || 90,

            // Forecast sums
            forecastPd: 0,
            m1Forecast: 0,
            m2Forecast: 0,
            m3Forecast: 0,
            m4Forecast: 0,
            m5Forecast: 0,

            // Inventory & Stock
            stkPd: Number(row.stkPd) || 0,
            stkPh: Number(row.stkPh) || 0,
            inventoryPd: Number(row.inventoryPd) || 0,
            inventoryPh: Number(row.inventoryPh) || 0,
            sumInventory: (Number(row.inventoryPd) || 0) + (Number(row.inventoryPh) || 0),
            receive: Number(row.receive) || 0,

            // PO & PR
            in: Number(row.in) || 0,
            m1Po: Number(row.m1Po) || 0,
            m2Po: Number(row.m2Po) || 0,
            m3Po: Number(row.m3Po) || 0,
            m4Po: Number(row.m4Po) || 0,
            m5Po: Number(row.m5Po) || 0,

            pr: Number(row.pr) || 0,
            m1Request: Number(row.m1Request) || 0,
            m2Request: Number(row.m2Request) || 0,
            m3Request: Number(row.m3Request) || 0,
            m4Request: Number(row.m4Request) || 0,
            m5Request: Number(row.m5Request) || 0,

            // Daily Issue
            issue: Number(row.issue) || 0,
            issueDate: row.issueDate || '-',

            sumAdvOrderQty: 0,
            sumAdvOrderQtyM1: 0,
            sumAdvOrderQtyM2: 0,
            sumAdvOrderQtyM3: 0,
            sumAdvOrderQtyM4: 0,
            sumAdvOrderQtyM5: 0,

            normalRate: nRate0,
            normalRateM1: nRateM1,
            normalRateM2: nRateM2,
            normalRateM3: nRateM3,
            normalRateM4: nRateM4,
            normalRateM5: nRateM5,
            orderRate: oRate0,
            orderRateM1: oRateM1,
            orderRateM2: oRateM2,
            orderRateM3: oRateM3,
            orderRateM4: oRateM4,
            orderRateM5: oRateM5,

            summaryOrderQty: 0,
            summaryOrderQtyM1: 0,
            summaryOrderQtyM2: 0,
            summaryOrderQtyM3: 0,
            summaryOrderQtyM4: 0,
            summaryOrderQtyM5: 0,

            _totalAdvWeightedOrderRate0: 0,
            _totalAdvWeightedOrderRateM1: 0,
            _totalAdvWeightedOrderRateM2: 0,
            _totalAdvWeightedOrderRateM3: 0,
            _totalAdvWeightedOrderRateM4: 0,
            _totalAdvWeightedOrderRateM5: 0,
            _partsCount: 0
          });
        }

        const item = map.get(itemKey);
        if (!item.vendorCode && row.vendorCode) item.vendorCode = row.vendorCode;
        if (!item.vendorName && row.vendorName) item.vendorName = row.vendorName;
        if (Number(row.unitPrice) > item.unitPrice) item.unitPrice = Number(row.unitPrice);
        if ((!item.name || item.name === '-') && row.name && row.name !== '-') item.name = row.name;
        if ((!item.spec || item.spec === '-') && row.spec && row.spec !== '-') item.spec = row.spec;

        const pNos = (row.allPartNos && row.allPartNos.length > 0)
          ? row.allPartNos
          : (row.partNo && row.partNo !== '-' ? String(row.partNo).split(',').map((p: string) => p.trim()).filter((p: string) => p && p !== '-') : []);
        for (const p of pNos) {
          if (!item.allPartNos.includes(p)) {
            item.allPartNos.push(p);
          }
        }
        if (row.partUsageDetailsArray && row.partUsageDetailsArray.length > 0) {
          for (const pud of row.partUsageDetailsArray) {
            if (pud && pud.partNo && !item.partUsageDetailsArray.some((x: any) => x.partNo === pud.partNo)) {
              item.partUsageDetailsArray.push({ ...pud });
            }
          }
        }
        if (row.isBroken100) item.isBroken100 = true;
        if (row.brokenAlert) item.brokenAlert = true;
        if (row.brokenRate && row.brokenRate > item.brokenRate) item.brokenRate = row.brokenRate;

        // Sum forecast quantities
        item.forecastPd += (Number(row.forecastPd) || 0);
        item.m1Forecast += (Number(row.m1Forecast) || 0);
        item.m2Forecast += (Number(row.m2Forecast) || 0);
        item.m3Forecast += (Number(row.m3Forecast) || 0);
        item.m4Forecast += (Number(row.m4Forecast) || 0);
        item.m5Forecast += (Number(row.m5Forecast) || 0);

        // Sum advance order quantities
        item.sumAdvOrderQty += advQty0;
        item.sumAdvOrderQtyM1 += advQtyM1;
        item.sumAdvOrderQtyM2 += advQtyM2;
        item.sumAdvOrderQtyM3 += advQtyM3;
        item.sumAdvOrderQtyM4 += advQtyM4;
        item.sumAdvOrderQtyM5 += advQtyM5;

        // Weighted order rate accumulation
        item._totalAdvWeightedOrderRate0 += (advQty0 * oRate0);
        item._totalAdvWeightedOrderRateM1 += (advQtyM1 * oRateM1);
        item._totalAdvWeightedOrderRateM2 += (advQtyM2 * oRateM2);
        item._totalAdvWeightedOrderRateM3 += (advQtyM3 * oRateM3);
        item._totalAdvWeightedOrderRateM4 += (advQtyM4 * oRateM4);
        item._totalAdvWeightedOrderRateM5 += (advQtyM5 * oRateM5);
        item._partsCount += 1;
      }

      let index = 1;
      const result: any[] = [];
      for (const item of map.values()) {
        item.no = index++;
        if (item.allPartNos.length > 0) {
          item.partNo = item.allPartNos[0];
          item.allPartNosString = item.allPartNos.join(', ');
        } else {
          item.partNo = item.partNo || '-';
          item.allPartNosString = item.partNo;
        }

        // Weighted Order Rates
        item.orderRate = (item.sumAdvOrderQty > 0 && item._totalAdvWeightedOrderRate0 > 0)
          ? Math.round((item._totalAdvWeightedOrderRate0 / item.sumAdvOrderQty) * 100) / 100
          : (item.normalRate || 120);

        item.orderRateM1 = (item.sumAdvOrderQtyM1 > 0 && item._totalAdvWeightedOrderRateM1 > 0)
          ? Math.round((item._totalAdvWeightedOrderRateM1 / item.sumAdvOrderQtyM1) * 100) / 100
          : (item.normalRateM1 || item.normalRate || 120);

        item.orderRateM2 = (item.sumAdvOrderQtyM2 > 0 && item._totalAdvWeightedOrderRateM2 > 0)
          ? Math.round((item._totalAdvWeightedOrderRateM2 / item.sumAdvOrderQtyM2) * 100) / 100
          : (item.normalRateM2 || item.normalRate || 120);

        item.orderRateM3 = (item.sumAdvOrderQtyM3 > 0 && item._totalAdvWeightedOrderRateM3 > 0)
          ? Math.round((item._totalAdvWeightedOrderRateM3 / item.sumAdvOrderQtyM3) * 100) / 100
          : (item.normalRateM3 || item.normalRate || 120);

        item.orderRateM4 = (item.sumAdvOrderQtyM4 > 0 && item._totalAdvWeightedOrderRateM4 > 0)
          ? Math.round((item._totalAdvWeightedOrderRateM4 / item.sumAdvOrderQtyM4) * 100) / 100
          : (item.normalRateM4 || item.normalRate || 120);

        item.orderRateM5 = (item.sumAdvOrderQtyM5 > 0 && item._totalAdvWeightedOrderRateM5 > 0)
          ? Math.round((item._totalAdvWeightedOrderRateM5 / item.sumAdvOrderQtyM5) * 100) / 100
          : (item.normalRateM5 || item.normalRate || 120);

        // Summary Order Quantities
        item.summaryOrderQty = Math.ceil(item.sumAdvOrderQty * ((item.orderRate || item.normalRate || 120) / 100));
        item.summaryOrderQtyM1 = Math.ceil(item.sumAdvOrderQtyM1 * ((item.orderRateM1 || item.normalRateM1 || 120) / 100));
        item.summaryOrderQtyM2 = Math.ceil(item.sumAdvOrderQtyM2 * ((item.orderRateM2 || item.normalRateM2 || 120) / 100));
        item.summaryOrderQtyM3 = Math.ceil(item.sumAdvOrderQtyM3 * ((item.orderRateM3 || item.normalRateM3 || 120) / 100));
        item.summaryOrderQtyM4 = Math.ceil(item.sumAdvOrderQtyM4 * ((item.orderRateM4 || item.normalRateM4 || 120) / 100));
        item.summaryOrderQtyM5 = Math.ceil(item.sumAdvOrderQtyM5 * ((item.orderRateM5 || item.normalRateM5 || 120) / 100));

        // Overview Forecast Issuance
        item.planSetup = item.summaryOrderQty;
        item.issM1 = item.summaryOrderQtyM1;
        item.issM2 = item.summaryOrderQtyM2;
        item.issM3 = item.summaryOrderQtyM3;
        item.issM4 = item.summaryOrderQtyM4;
        item.issM5 = item.summaryOrderQtyM5;

        // Inventory Stock & Beginning Balance
        item.currentStock = item.stkPd + item.stkPh;
        item.beg = item.currentStock;
        item.stockOnHand = item.currentStock;

        // Monthly view concept: Inventory PD + Inventory PH + Receive + PO + PR = total, and total - forecast = end
        const invPdVal = Number(item.inventoryPd) || 0;
        const invPhVal = Number(item.inventoryPh) || 0;
        const rcvVal = Number(item.receive) || 0;
        const poVal = Number(item.in) || 0;
        const prVal = Number(item.pr) || 0;
        item.totalSupply = invPdVal + invPhVal + rcvVal + poVal + prVal;
        item.total = item.totalSupply;

        // Running End Balances
        item.end = item.totalSupply - (item.planSetup || 0);
        item.m1Beg = item.end;
        item.m1End = item.m1Beg + item.m1Po + item.m1Request - item.issM1;
        item.m2Beg = item.m1End;
        item.m2End = item.m2Beg + item.m2Po + item.m2Request - item.issM2;
        item.m3Beg = item.m2End;
        item.m3End = item.m3Beg + item.m3Po + item.m3Request - item.issM3;
        item.m4Beg = item.m3End;
        item.m4End = item.m4Beg + item.m4Po + item.m4Request - item.issM4;
        item.m5Beg = item.m4End;
        item.m5End = item.m5Beg + item.m5Po + item.m5Request - item.issM5;

        // Daily Monitor
        let targetDailyForecast = item.planSetup;
        let targetPo = item.in;
        let targetPr = item.pr;
        if (this.selectedDailyForecastMonthOffset === 1) {
          targetDailyForecast = item.issM1;
          targetPo = item.m1Po;
          targetPr = item.m1Request;
        } else if (this.selectedDailyForecastMonthOffset === 2) {
          targetDailyForecast = item.issM2;
          targetPo = item.m2Po;
          targetPr = item.m2Request;
        } else if (this.selectedDailyForecastMonthOffset === 3) {
          targetDailyForecast = item.issM3;
          targetPo = item.m3Po;
          targetPr = item.m3Request;
        } else if (this.selectedDailyForecastMonthOffset === 4) {
          targetDailyForecast = item.issM4;
          targetPo = item.m4Po;
          targetPr = item.m4Request;
        } else if (this.selectedDailyForecastMonthOffset === 5) {
          targetDailyForecast = item.issM5;
          targetPo = item.m5Po;
          targetPr = item.m5Request;
        }

        item.dailyTotalSupply = (item.stockOnHand || 0) + (Number(targetPo) || 0) + (Number(targetPr) || 0);
        item.balanceIssue = (targetDailyForecast || 0) - (item.issue || 0);
        item.blUseMonth = item.dailyTotalSupply - item.balanceIssue;

        // Order Plan (Orders Date, Vendor, Price)
        const orderPlan = this.calculateOrderPlan(item);
        Object.assign(item, orderPlan);

        const manualKey = `${item.itemNo}_${this.targetOrderMonthOffset || 0}`;
        if (this.manualConfirmQtyMap && this.manualConfirmQtyMap[manualKey] !== undefined) {
          item.confirmQty = this.manualConfirmQtyMap[manualKey];
        }
        item.amount = (Number(item.unitPrice) || 0) * (Number(item.confirmQty) || 0);

        result.push(item);
      }
      return result;
    } catch (err) {
      console.error('Failed to build summary orders row data:', err);
      return [];
    }
  }

  calculateOrderPlan(row: any) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const m0Index = months.findIndex(m => m.toLowerCase() === (this.selectedMonth || 'january').toLowerCase());
    const currentYear = parseInt(this.selectedYear || '2026', 10);

    let shortageMonthName = null;
    let shortageDate: Date | null = null;

    const endBalances = [
      { end: row.end, offset: 0 },
      { end: row.m1End, offset: 1 },
      { end: row.m2End, offset: 2 },
      { end: row.m3End, offset: 3 },
      { end: row.m4End, offset: 4 },
      { end: row.m5End, offset: 5 }
    ];

    const selectedOffset = Number(this.targetOrderMonthOffset) || 0;
    const targetBal = endBalances.find(eb => eb.offset === selectedOffset)?.end || 0;

    if (targetBal < 0) {
      const mIndex = (m0Index + selectedOffset) % 12;
      const year = currentYear + Math.floor((m0Index + selectedOffset) / 12);
      shortageMonthName = `${months[mIndex].substring(0, 3)} ${year}`;
      shortageDate = new Date(year, mIndex, 1);
    }

    let suggestOrderDateStr = null;
    let orderStatus = '-';
    let suggestOrderQty = null;

    let dueDateStr = null;

    const key = `${String(row._realItemNo || row.itemNo).trim().toUpperCase()}_${selectedOffset}`;
    let confirmQty: any = undefined;

    if (this.manualConfirmQtyMap && this.manualConfirmQtyMap.hasOwnProperty(key)) {
      confirmQty = this.manualConfirmQtyMap[key];
    } else {
      // Clear confirmQty if no manual entry exists for this month,
      // so it will be recalculated below
      confirmQty = undefined;
    }

    const hasManualConfirm = confirmQty !== undefined && confirmQty !== null && confirmQty !== '' && Number(confirmQty) > 0;

    if (shortageDate || hasManualConfirm) {
      const planForIndex = (m0Index + selectedOffset) % 12;
      const planForYear = currentYear + Math.floor((m0Index + selectedOffset) / 12);
      const ddDue = '01';
      const mmDue = String(planForIndex + 1).padStart(2, '0');
      dueDateStr = `${ddDue}/${mmDue}/${planForYear}`;
      const baseDateForLT = new Date(planForYear, planForIndex, 1);

      const suggestDate = new Date(baseDateForLT);
      suggestDate.setDate(suggestDate.getDate() - (row.lt || 90));

      const dd = String(suggestDate.getDate()).padStart(2, '0');
      const mm = String(suggestDate.getMonth() + 1).padStart(2, '0');
      const yyyy = suggestDate.getFullYear();
      suggestOrderDateStr = `${dd}/${mm}/${yyyy}`;

      if (shortageDate) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const diffTime = suggestDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          orderStatus = 'OVERDUE';
        } else if (diffDays <= 14) {
          orderStatus = 'URGENT';
        } else {
          orderStatus = 'NORMAL';
        }

        suggestOrderQty = Math.abs(targetBal);

        // Let confirmQty default to MOQ of 10, but keep suggestOrderQty as the exact raw number
        let defaultConfirmQty = suggestOrderQty;
        if (defaultConfirmQty > 0 && defaultConfirmQty < 10) {
          defaultConfirmQty = 10;
        }

        if (confirmQty === undefined || confirmQty === null || confirmQty === '') {
          confirmQty = defaultConfirmQty;
        }
      } else {
        orderStatus = 'SAFE';
      }
    } else {
      orderStatus = 'SAFE';
    }

    return {
      shortageMonth: shortageMonthName,
      suggestOrderDate: suggestOrderDateStr,
      dueDate: dueDateStr,
      suggestOrderQty: suggestOrderQty,
      confirmQty: confirmQty,
      amount: (Number(confirmQty) || 0) * (Number(row.unitPrice) || 0),
      minBalance: targetBal,
      orderStatus: orderStatus,
      advOrderQty: this.calcAdvOrderQty(row, 0),
      advOrderQtyM1: this.calcAdvOrderQty(row, 1),
      advOrderQtyM2: this.calcAdvOrderQty(row, 2),
      advOrderQtyM3: this.calcAdvOrderQty(row, 3),
      advOrderQtyM4: this.calcAdvOrderQty(row, 4),
      advOrderQtyM5: this.calcAdvOrderQty(row, 5)
    };
  }

  onBulkNormalRateChange(event: any) {
    const newRate = typeof event === 'number' ? event : Number(event.target.value);
    if (!newRate) return;

    const monthStr = this.getMonthNameForContext((this.selectedRateMonth === 'default' ? 'm0' : this.selectedRateMonth.toLowerCase()) as any);

    Swal.fire({
      title: `Change Normal Rate for ${monthStr}?`,
      text: `You are about to change the Normal Rate of all items for ${monthStr} to ${newRate}%. Are you sure?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, change it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        // Apply bulk change
        const updatedData = [...this.purchaseRowData];
        for (let i = 0; i < updatedData.length; i++) {
          const row = { ...updatedData[i] };

          if (this.selectedRateMonth === 'default') {
            row.normalRate = newRate;
          } else if (this.selectedRateMonth === 'M1') {
            row.normalRateM1 = newRate;
          } else if (this.selectedRateMonth === 'M2') {
            row.normalRateM2 = newRate;
          } else if (this.selectedRateMonth === 'M3') {
            row.normalRateM3 = newRate;
          } else if (this.selectedRateMonth === 'M4') {
            row.normalRateM4 = newRate;
          } else if (this.selectedRateMonth === 'M5') {
            row.normalRateM5 = newRate;
          }

          row.stkPd = Number(row.stkPd) || 0;
          row.stkPh = Number(row.stkPh) || 0;
          row.inventoryPd = Number(row.inventoryPd) || 0;
          row.inventoryPh = Number(row.inventoryPh) || 0;
          row.sumInventory = row.inventoryPd + row.inventoryPh;
          row.currentStock = row.stkPd + row.stkPh;
          row.beg = row.currentStock;

          row.in = Number(row.in) || 0;
          row.pr = Number(row.pr) || 0;
          row.m1Po = Number(row.m1Po) || 0;
          row.m2Po = Number(row.m2Po) || 0;
          row.m3Po = Number(row.m3Po) || 0;
          row.m4Po = Number(row.m4Po) || 0;
          row.m5Po = Number(row.m5Po) || 0;

          row.normalRate = Number(row.normalRate) || 0;
          row.normalRateM1 = Number(row.normalRateM1 ?? row.normalRate) || 0;
          row.normalRateM2 = Number(row.normalRateM2 ?? row.normalRate) || 0;
          row.normalRateM3 = Number(row.normalRateM3 ?? row.normalRate) || 0;
          row.normalRateM4 = Number(row.normalRateM4 ?? row.normalRate) || 0;
          row.normalRateM5 = Number(row.normalRateM5 ?? row.normalRate) || 0;

          row.achieveRate = Number(row.achieveRate) || 100;
          if (row.achieveRate <= 0) row.achieveRate = 100;

          const calcOrderRate = (nRate: number, advRate: number) => {
            if (advRate >= 100) return Math.round(nRate * 100) / 100;
            if (advRate <= 0) return 0;
            return Math.round((nRate / (advRate / 100)) * 100) / 100;
          };

          const advRate = row.advanceAchieveRate != null ? row.advanceAchieveRate : (row.achieveRate ?? 100);
          row.orderRate = calcOrderRate(row.normalRate, advRate);
          row.orderRateM1 = calcOrderRate(row.normalRateM1, advRate);
          row.orderRateM2 = calcOrderRate(row.normalRateM2, advRate);
          row.orderRateM3 = calcOrderRate(row.normalRateM3, advRate);
          row.orderRateM4 = calcOrderRate(row.normalRateM4, advRate);
          row.orderRateM5 = calcOrderRate(row.normalRateM5, advRate);
          row.calculation = row.orderRate;

          const issM0 = Math.ceil((row.forecastPd || 0) * (row.orderRate / 100));
          const issM1 = Math.ceil((row.m1Forecast || 0) * (row.orderRateM1 / 100));
          const issM2 = Math.ceil((row.m2Forecast || 0) * (row.orderRateM2 / 100));
          const issM3 = Math.ceil((row.m3Forecast || 0) * (row.orderRateM3 / 100));
          const issM4 = Math.ceil((row.m4Forecast || 0) * (row.orderRateM4 / 100));
          const issM5 = Math.ceil((row.m5Forecast || 0) * (row.orderRateM5 / 100));

          row.planSetup = issM0;
          row.issM1 = issM1;
          row.issM2 = issM2;
          row.issM3 = issM3;
          row.issM4 = issM4;
          row.issM5 = issM5;

          const invPd = Number(row.inventoryPd) || 0;
          const invPh = Number(row.inventoryPh) || 0;
          const rcv = Number(row.receive) || 0;
          const po = Number(row.in) || 0;
          const pr = Number(row.pr) || 0;
          row.totalSupply = invPd + invPh + rcv + po + pr;
          row.total = row.totalSupply;
          row.end = row.totalSupply - issM0;
          row.m1Beg = row.end;
          row.m1End = row.m1Beg + row.m1Po + (Number(row.m1Request) || 0) - issM1;
          row.m2Beg = row.m1End;
          row.m2End = row.m2Beg + row.m2Po + (Number(row.m2Request) || 0) - issM2;
          row.m3Beg = row.m2End;
          row.m3End = row.m3Beg + row.m3Po + (Number(row.m3Request) || 0) - issM3;
          row.m4Beg = row.m3End;
          row.m4End = row.m4Beg + row.m4Po + (Number(row.m4Request) || 0) - issM4;
          row.m5Beg = row.m4End;
          row.m5End = row.m5Beg + row.m5Po + (Number(row.m5Request) || 0) - issM5;

          // Daily Monitor
          row.issue = Number(row.issue) || 0;
          let targetDailyForecast = row.planSetup;
          let targetPo = row.in;
          let targetPr = row.pr;
          if (this.selectedDailyForecastMonthOffset === 1) { targetDailyForecast = row.issM1; targetPo = row.m1Po; targetPr = row.m1Request; }
          else if (this.selectedDailyForecastMonthOffset === 2) { targetDailyForecast = row.issM2; targetPo = row.m2Po; targetPr = row.m2Request; }
          else if (this.selectedDailyForecastMonthOffset === 3) { targetDailyForecast = row.issM3; targetPo = row.m3Po; targetPr = row.m3Request; }
          else if (this.selectedDailyForecastMonthOffset === 4) { targetDailyForecast = row.issM4; targetPo = row.m4Po; targetPr = row.m4Request; }
          else if (this.selectedDailyForecastMonthOffset === 5) { targetDailyForecast = row.issM5; targetPo = row.m5Po; targetPr = row.m5Request; }

          row.stockOnHand = Number(row.currentStock) || (row.stkPd + row.stkPh) || 0;
          row.dailyTotalSupply = row.stockOnHand + (Number(targetPo) || 0) + (Number(targetPr) || 0);
          row.balanceIssue = (targetDailyForecast || 0) - row.issue;
          row.blUseMonth = row.dailyTotalSupply - row.balanceIssue;

          const orderPlan = this.calculateOrderPlan(row);
          Object.assign(row, orderPlan);
          updatedData[i] = row;
        }

        this.purchaseRowData = updatedData;
        if (this.purchaseViewMode === 'parameters') {
          if (this.purchaseGridApi) {
            this.purchaseGridApi.setGridOption('rowData', updatedData);
          }
        } else {
          this.summaryOrdersRowData = this.buildSummaryOrdersRowData();
          if (this.purchaseGridApi) {
            this.purchaseGridApi.setGridOption('rowData', this.summaryOrdersRowData);
          }
        }

        // Update the display for the button
        this.currentBulkRates[this.selectedRateMonth] = newRate.toString();

        this.cdr.detectChanges();

        Swal.fire(
          'Updated!',
          `Normal Rate for ${monthStr} has been successfully changed to ${newRate}% for all items.`,
          'success'
        );
      }

      // Reset dropdown selection if it was a select element
      if (typeof event !== 'number' && event?.target) {
        event.target.value = "";
      }
    });
  }

  showForecast() {
    Swal.fire({
      title: 'Auto-Syncing Plan...',
      html: `
        <div aria-label="Orange and tan hamster running in a metal wheel" role="img" class="wheel-and-hamster mx-auto my-4">
          <div class="wheel"></div>
          <div class="hamster">
            <div class="hamster__body">
              <div class="hamster__head">
                <div class="hamster__ear"></div>
                <div class="hamster__eye"></div>
                <div class="hamster__nose"></div>
              </div>
              <div class="hamster__limb hamster__limb--fr"></div>
              <div class="hamster__limb hamster__limb--fl"></div>
              <div class="hamster__limb hamster__limb--br"></div>
              <div class="hamster__limb hamster__limb--bl"></div>
              <div class="hamster__tail"></div>
            </div>
          </div>
          <div class="spoke"></div>
        </div>
        <div class="text-muted mt-3">Fetching data for ${this.selectedMonth} ${this.selectedYear} (${this.selectedRevision}) and recalculating...</div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false
    });

    const prev = this.getPreviousMonth(this.selectedMonth, this.selectedYear);
    forkJoin({
      balance: this.forecastService.getForecastBalance(prev.prevMonth, prev.prevYear, ''),
      pcPlan: this.forecastService.getPCPlan(this.selectedMonth, this.selectedYear, this.selectedRevision),
      master: this.forecastService.getToolingMaster(),
      usage: this.forecastService.getToolingUsageParameters()
    }).subscribe({
      next: (res) => {
        try {
          this.carryForwardBalances.clear();
          if (res.balance && res.balance.length) {
            res.balance.forEach((b: any) => this.carryForwardBalances.set(String(b.ItemNo).trim().toUpperCase(), Number(b.EndStock)));
          }

          const data = res.pcPlan;
          if (data && data.length > 0) {
            // Reconstruct raw orders
            const rawOrdersMap = new Map<string, any>();
            data.forEach((row: any) => {
              const rawMc = (row.mc || '').replace(/[\s\-]/g, '').toUpperCase();
              const rawProc = (row.process || '').replace(/[\s\-&]/g, '').toUpperCase();
              const key = `${row.targetMonth}_${row.partNo}_${rawMc}_${rawProc}`;
              if (!rawOrdersMap.has(key)) {
                rawOrdersMap.set(key, {
                  partNo: row.partNo,
                  mc: row.mc,
                  process: row.process,
                  targetMonth: row.targetMonth,
                  partRev: row.partRev,
                  partQty: row.partQty,
                  working: row.working
                });
              }
            });
            const rawOrders = Array.from(rawOrdersMap.values());

            // Map with master data
            const mappedOrders: any[] = [];
            const masterMap = new Map<string, any[]>();
            res.master.forEach((m: any) => {
              const masterProc = (m.Process || '').replace(/[\s\-&]/g, '').toUpperCase();
              const key = `${m.PartNo}_${masterProc}`;
              if (!masterMap.has(key)) masterMap.set(key, []);
              masterMap.get(key)!.push(m);
            });

            rawOrders.forEach(rawOrd => {
                const rawProc = (rawOrd.process || '').replace(/[\s\-&]/g, '').toUpperCase();
                const key = `${rawOrd.partNo}_${rawProc}`;
                const matchedMasters = masterMap.get(key) || [];
                if (matchedMasters.length > 0) {
                    matchedMasters.forEach(m => {
                        mappedOrders.push({
                            partNo: rawOrd.partNo,
                            itemNo: m.ItemNo,
                            position: m.Position || 'T1',
                            partQty: rawOrd.partQty,
                            working: rawOrd.working,
                            ctSec: m.CT_sec,
                            usagePcs: m.Usage_pcs,
                            initialItemQty: 1, // Tool_use is always 1 per position
                            process: rawOrd.process || m.Process,
                            mc: rawOrd.mc || m.MC,
                            targetMonth: rawOrd.targetMonth,
                            partRev: rawOrd.partRev,
                            orderId: rawOrd.orderId,
                            unitPrice: m.unitPrice || m.Unit_Price || 0,
                            name: `Tooling for ${m.ItemNo}`
                        });
                    });
                } else {
                    mappedOrders.push({
                        partNo: rawOrd.partNo,
                        itemNo: '-',
                        position: '-',
                        partQty: rawOrd.partQty,
                        working: rawOrd.working,
                        ctSec: 0,
                        usagePcs: 0,
                        initialItemQty: 1,
                        process: rawOrd.process,
                        mc: rawOrd.mc,
                        targetMonth: rawOrd.targetMonth,
                        partRev: rawOrd.partRev,
                        orderId: rawOrd.orderId,
                        name: `Tooling for ${rawOrd.partNo}`
                    });
                }
            });

            const calculatedData = this.calculateForecast(mappedOrders, [], res.usage);
            this.totalAmount = calculatedData.reduce((s: number, d: any) => s + (d.amount || 0), 0);

            this.allForecastRowData = calculatedData;
            this.applyMissingItemFilter();

            Swal.close(); // Close hamster immediately!

            // Silent Auto-Save in background
            const payload = {
               month: this.selectedMonth,
               year: this.selectedYear,
               revision: this.selectedRevision,
               createdBy: this.Employee_Name || this.role || 'System',
               data: calculatedData
            };
            this.forecastService.submitForecast(payload).subscribe({
               next: () => {
                  const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true
                  });
                  Toast.fire({
                    icon: 'success',
                    title: 'Plan Auto-Synced to Database'
                  });
               },
               error: (err) => {
                  console.error('Auto-save failed:', err);
                  const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000
                  });
                  Toast.fire({
                    icon: 'warning',
                    title: 'Auto-save failed. Data is only local.'
                  });
               }
            });
          } else {
             this.allForecastRowData = [];
             this.applyMissingItemFilter();
             Swal.fire({
                icon: 'info',
                title: 'No Data Found',
                text: `No plan records found for ${this.selectedMonth} ${this.selectedYear} (${this.selectedRevision}) in Database.`
             });
          }
        } catch (e: any) {
          console.error(e);
          Swal.close();
          Swal.fire('Calculation Error', 'An error occurred while calculating the forecast: ' + e.message, 'error');
        }
      },
      error: (err) => {
         Swal.close();
         Swal.fire('Error', 'Failed to fetch data.', 'error');
      }
    });
  }

  // --- Tab 2 Functions ---
  loadOrders() {
    Swal.fire({
      title: 'Loading Orders...',
      text: 'Fetching active orders from PBGM8G...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Pull orders from PBGM8G
    this.forecastService.getOrders().subscribe({
      next: (data) => {
        this.ordersRowData = data;
        Swal.close();
        Swal.fire({
          icon: 'success',
          title: 'Loaded!',
          text: `Successfully loaded ${data.length} orders from PBGM8G database.`,
          timer: 1500,
          showConfirmButton: false
        });
      },
      error: (err) => {
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Load Failed',
          text: `Failed to load orders from PBGM8G: ${err.error?.error || err.message}`
        });
      }
    });
  }

  insertOrder() {
    Swal.fire({
      title: 'Insert Order Record',
      html: `
        <div class="row g-3 text-start">
          <div class="col-12">
            <label class="form-label font-semibold">Order ID</label>
            <input id="swal-orderid" class="form-control" placeholder="e.g. ORD-2026-999">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Process</label>
            <input id="swal-process" class="form-control" placeholder="e.g. Injection">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">MC</label>
            <input id="swal-mc" class="form-control" placeholder="e.g. MC-MOLD-09">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Part No</label>
            <input id="swal-partno" class="form-control" placeholder="e.g. P-55667">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Part Qty</label>
            <input id="swal-partqty" type="number" class="form-control" placeholder="e.g. 1500">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Month</label>
            <select id="swal-month" class="form-select">
              ${this.months.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Add Record',
      cancelButtonText: 'Cancel',
      focusConfirm: false,
      customClass: {
        confirmButton: 'btn btn-primary me-2',
        cancelButton: 'btn btn-secondary'
      },
      buttonsStyling: false,
      preConfirm: () => {
        const orderId = (document.getElementById('swal-orderid') as HTMLInputElement).value;
        const process = (document.getElementById('swal-process') as HTMLInputElement).value;
        const mc = (document.getElementById('swal-mc') as HTMLInputElement).value;
        const partNo = (document.getElementById('swal-partno') as HTMLInputElement).value;
        const partQty = (document.getElementById('swal-partqty') as HTMLInputElement).value;
        const month = (document.getElementById('swal-month') as HTMLSelectElement).value;

        if (!orderId || !process || !mc || !partNo || !partQty) {
          Swal.showValidationMessage('Please enter all fields');
          return false;
        }

        return { orderId, process, mc, partNo, partQty: Number(partQty), month };
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        this.forecastService.insertOrder(result.value).subscribe({
          next: () => {
            this.loadOrders(); // reload grid
          },
          error: (err) => {
            Swal.fire('Insert Failed', err.error?.error || err.message, 'error');
          }
        });
      }
    });
  }

  editSelectedOrder() {
    if (!this.ordersGridApi) return;
    const selectedRows = this.ordersGridApi.getSelectedRows();
    if (selectedRows.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No Row Selected',
        text: 'Please select a row to edit first.',
        confirmButtonText: 'OK'
      });
      return;
    }

    const row = selectedRows[0];
    Swal.fire({
      title: 'Edit Order Record',
      html: `
        <div class="row g-3 text-start">
          <div class="col-12">
            <label class="form-label font-semibold">Order ID (ReadOnly)</label>
            <input id="swal-orderid" class="form-control bg-light" placeholder="Order ID" value="${row.orderId}" readonly disabled>
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Process</label>
            <input id="swal-process" class="form-control" placeholder="Process" value="${row.process}">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">MC</label>
            <input id="swal-mc" class="form-control" placeholder="MC" value="${row.mc}">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Part No</label>
            <input id="swal-partno" class="form-control" placeholder="Part No" value="${row.partNo}">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Part Qty</label>
            <input id="swal-partqty" type="number" class="form-control" placeholder="Part Qty" value="${row.partQty}">
          </div>
          <div class="col-12">
            <label class="form-label font-semibold">Month</label>
            <select id="swal-month" class="form-select">
              ${this.months.map(m => `<option value="${m}" ${m === row.month ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Save Changes',
      cancelButtonText: 'Cancel',
      focusConfirm: false,
      customClass: {
        confirmButton: 'btn btn-warning text-dark me-2',
        cancelButton: 'btn btn-secondary'
      },
      buttonsStyling: false,
      preConfirm: () => {
        const process = (document.getElementById('swal-process') as HTMLInputElement).value;
        const mc = (document.getElementById('swal-mc') as HTMLInputElement).value;
        const partNo = (document.getElementById('swal-partno') as HTMLInputElement).value;
        const partQty = (document.getElementById('swal-partqty') as HTMLInputElement).value;
        const month = (document.getElementById('swal-month') as HTMLSelectElement).value;

        if (!process || !mc || !partNo || !partQty) {
          Swal.showValidationMessage('Please enter all fields');
          return false;
        }

        return { orderId: row.orderId, process, mc, partNo, partQty: Number(partQty), month };
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        this.forecastService.updateOrder(result.value).subscribe({
          next: () => {
            this.loadOrders(); // reload grid
          },
          error: (err) => {
            Swal.fire('Update Failed', err.error?.error || err.message, 'error');
          }
        });
      }
    });
  }

  deleteSelectedOrder() {
    if (!this.ordersGridApi) return;
    const selectedRows = this.ordersGridApi.getSelectedRows();
    if (selectedRows.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No Row Selected',
        text: 'Please select a row to delete first.',
        confirmButtonText: 'OK'
      });
      return;
    }

    const row = selectedRows[0];
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to delete Order: ${row.orderId}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        this.forecastService.deleteOrder(row.orderId).subscribe({
          next: () => {
            this.loadOrders(); // reload grid
          },
          error: (err) => {
            Swal.fire('Delete Failed', err.error?.error || err.message, 'error');
          }
        });
      }
    });
  }

  // --- Tab 3 Functions ---
  onFileChange(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.selectedFile = files[0];
    } else {
      this.selectedFile = null;
    }
  }

  importData() {
    if (!this.selectedFile) {
      Swal.fire({
        icon: 'error',
        title: 'No File Selected',
        text: 'Please browse and select a valid .xlsx file first.',
        confirmButtonText: 'OK',
        customClass: { confirmButton: 'btn btn-danger' }
      });
      return;
    }

    Swal.fire({
      title: 'Importing Master Data...',
      html: `Parsing <b>${this.selectedFile.name}</b> and updating Master Tooling DB (UPSERT)`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        const importPayload: any[] = [];

        jsonData.forEach((row, idx) => {
          const getVal = (keys: string[], defaultVal: any = ''): any => {
            for (const key of Object.keys(row)) {
              const cleanKey = key.toLowerCase().replace(/[\s_\-\/]/g, '');
              if (keys.some(k => cleanKey === k.toLowerCase().replace(/[\s_\-\/]/g, ''))) return row[key];
            }
            return defaultVal;
          };

          const partNo = getVal(['partno', 'part_no']).toString();
          const itemNo = getVal(['itemno', 'item_no', 'tooling']).toString();

          if (partNo && itemNo) {
            importPayload.push({
              partNo: partNo,
              itemNo: itemNo,
              process: getVal(['process', 'division', 'spec']),
              mc: getVal(['mc', 'machine']),
              usagePcs: Number(getVal(['usagepcs', 'usage_pcs', 'toollife', 'tool_life'], 0)),
              ctSec: Number(getVal(['ctsec', 'ct_sec', 'cycletime'], 0))
            });
          }
        });

        if (importPayload.length === 0) {
          Swal.fire({ icon: 'warning', title: 'Empty Data', text: 'No valid PartNo and ItemNo found in the file.' });
          return;
        }

        this.forecastService.importToolingMaster(importPayload).subscribe({
          next: (response) => {
            Swal.fire({
              icon: 'success',
              title: 'Import Complete!',
              text: `Successfully updated ${response.recordsUpdated} Master Tooling records.`,
              confirmButtonText: 'OK'
            });
            this.clearFile();
          },
          error: (err) => {
            console.error(err);
            Swal.fire({
              icon: 'error',
              title: 'Import Failed',
              text: err.error?.error || err.message || 'Server Error'
            });
          }
        });
      } catch (err: any) {
        Swal.fire({ icon: 'error', title: 'Parse Error', text: 'Failed to read Excel file: ' + err.message });
      }
    };
    reader.onerror = () => {
      Swal.fire({ icon: 'error', title: 'File Error', text: 'Error reading file.' });
    };
    reader.readAsArrayBuffer(this.selectedFile);
  }

  private clearFile() {
    this.selectedFile = null;
    const fileInput = document.getElementById('excelFileInput') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  onPlanningFileChange(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.selectedPlanningFile = files[0];
    } else {
      this.selectedPlanningFile = null;
    }
  }

  downloadTemplate() {
    const HEADERS = ['Month', 'YearPlan', 'MonthPlan', 'Process', 'PartNo', 'MC', 'Rev', 'Part_qty'];
    const wb = XLSX.utils.book_new();
    const ws: any = {};

    // Header Row
    HEADERS.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: h, t: 's' };
    });

    // Sheet range and column widths
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });
    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Planning_Template');
    XLSX.writeFile(wb, 'Forecast_Planning_Template.xlsx');
  }


  importAndCalculatePlanning() {
    if (!this.selectedPlanningFile) {
      Swal.fire({
        icon: 'error',
        title: 'No File Selected',
        text: 'Please select a valid Excel file containing planning data first.',
        confirmButtonText: 'OK',
        customClass: { confirmButton: 'btn btn-danger' }
      });
      return;
    }

    this.previewFileName = this.selectedPlanningFile.name;

    // Parse Excel first, then show preview modal (Raw Data Only)
    this.parseExcelLocally(this.selectedPlanningFile).then(({ orders, inventory }) => {
      this.previewOrders   = orders;
      this.previewInventory = inventory;
      this.showPreviewModal = true;  // ฿Դ Preview Modal
    }).catch(err => {
      Swal.fire({
        icon: 'error',
        title: 'Error reading file',
        text: `Cannot read Excel file: ${err.message || err}`,
        confirmButtonText: 'OK'
      });
    });
  }

  closePreviewModal() {
    this.showPreviewModal = false;
    this.isCalculating   = false;
    this.calcProgress    = 0;
    this.calcStatusMsg   = '';
  }

  // --- Purchase Summary Modal ---
  openPurchaseSummary() {
    if (!this.purchaseGridApi) return;

    let filteredData: any[] = [];
    this.purchaseGridApi.forEachNodeAfterFilter((node: any) => {
      filteredData.push(node.data);
    });

    const vendorMap = new Map<string, any>();
    const processMap = new Map<string, number>();
    let totalItems = 0;
    let totalPieces = 0;
    let totalAmt = 0;

    filteredData.forEach(row => {
      totalItems++;
      totalPieces += (row.planSetup || 0);
      const amt = row.amount || 0;
      totalAmt += amt;

      const vCode = row.vendorCode || 'Unknown';
      const vName = row.vendorName || 'Unknown Vendor';
      if (!vendorMap.has(vCode)) {
        vendorMap.set(vCode, { code: vCode, name: vName, amount: 0 });
      }
      vendorMap.get(vCode).amount += amt;

      const proc = row.process || 'Unknown Process';
      processMap.set(proc, (processMap.get(proc) || 0) + amt);
    });

    this.topVendors = Array.from(vendorMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const maxVendorAmt = this.topVendors.length > 0 ? this.topVendors[0].amount : 0;
    this.topVendors.forEach(v => {
      v.percent = maxVendorAmt > 0 ? (v.amount / maxVendorAmt) * 100 : 0;
    });

    this.processSummary = Array.from(processMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const maxProcessAmt = this.processSummary.length > 0 ? this.processSummary[0].amount : 0;
    this.processSummary.forEach(p => {
      p.percent = maxProcessAmt > 0 ? (p.amount / maxProcessAmt) * 100 : 0;
    });

    this.summaryTotalItems = totalItems;
    this.summaryTotalPieces = totalPieces;
    this.summaryTotalAmount = totalAmt;
    this.showSummaryModal = true;
  }

  closePurchaseSummary() {
    this.showSummaryModal = false;
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget && !this.isCalculating) {
      this.closePreviewModal();
    }
  }

  confirmAndCalculate() {
    this.isCalculating = true;
    this.calcProgress  = 0;
    this.calcStatusMsg = '';

    const steps = [
      { msg: '฿฿฿ѧ฿฿Ǩ฿ͺ฿฿฿฿฿١฿฿ͧ฿ͧ฿฿฿฿฿฿...',             pct: 15,  delay: 0    },
      { msg: '฿ӹǳ฿฿฿฿฿฿฿฿฿฿ͧ฿ѡ฿ (Capacity/Day)...',   pct: 35,  delay: 100  },
      { msg: '฿ӹǳ฿฿฿฿ͧ฿ѡ÷฿฿฿ͧ฿฿ (MC_qty)...',    pct: 58,  delay: 200 },
      { msg: '฿฿Ѻ฿ӹǹ฿฿฿฿฿฿฿฿฿฿͹฿ (Item_qty)...', pct: 78,  delay: 300 },
      { msg: '฿ӹǳ฿฿Ť฿฿฿฿฿ (Amount)...',                 pct: 92,  delay: 400 },
      { msg: '฿฿฿฿฿฿฿! ฿฿฿฿฿฿ʴ฿฿฿§ҹ...',                  pct: 100, delay: 500 }
    ];

    steps.forEach(step => {
      setTimeout(() => {
        this.calcProgress  = step.pct;
        this.calcStatusMsg = step.msg;
        this.cdr.detectChanges();
      }, step.delay);
    });

    // Map with master data and calculate real forecast
    setTimeout(() => {
      this.forecastService.getToolingMaster().subscribe({
        next: (masterData) => {
          // Perform Mapping here
          const mappedOrders: any[] = [];

          // Pre-compute master map for O(1) lookup
          const masterMap = new Map<string, any[]>();
          masterData.forEach(m => {
            const masterProc = (m.Process || '').replace(/[\s\-&]/g, '').toUpperCase();
            const key = `${m.PartNo}_${masterProc}`;
            if (!masterMap.has(key)) masterMap.set(key, []);
            masterMap.get(key)!.push(m);
          });

          this.previewOrders.forEach(rawOrd => {
            const rawProc = (rawOrd.process || '').replace(/[\s\-&]/g, '').toUpperCase();
            const key = `${rawOrd.partNo}_${rawProc}`;
            const matchedMasters = masterMap.get(key) || [];

            if (matchedMasters.length > 0) {
              matchedMasters.forEach(m => {
                mappedOrders.push({
                  orderId: rawOrd.orderId,
                  partNo: rawOrd.partNo,
                  itemNo: m.ItemNo,
                  position: m.Position || 'T1',
                  partQty: rawOrd.partQty,
                  working: rawOrd.working,
                  ctSec: m.CT_sec,
                  usagePcs: m.Usage_pcs,
                  initialItemQty: 1, // Tool use is 1 per position
                  process: rawOrd.process || m.Process,
                  mc: rawOrd.mc || m.MC,
                  targetMonth: rawOrd.targetMonth,
                  partRev: rawOrd.partRev,
                  amount: 0,
                  name: `Tooling for ${m.ItemNo}`
                });
              });
            } else {
              mappedOrders.push({
                ...rawOrd,
                itemNo: rawOrd.itemNo || rawOrd.partNo,
                targetMonth: rawOrd.targetMonth,
                partRev: rawOrd.partRev,
                name: `Tooling for ${rawOrd.partNo}`
              });
            }
          });

          const prev = this.getPreviousMonth(this.importPlanningMonth, this.importPlanningYear);
          this.forecastService.getForecastBalance(prev.prevMonth, prev.prevYear, '').subscribe({
            next: (balances) => {
              this.carryForwardBalances.clear();
              if (balances && balances.length) {
                balances.forEach((b: any) => this.carryForwardBalances.set(String(b.ItemNo).trim().toUpperCase(), Number(b.EndStock)));
              }
              const calculatedData = this.calculateForecast(mappedOrders, this.previewInventory);
              this.totalAmount = calculatedData.reduce((s: number, d: any) => s + (d.amount || 0), 0);

              this.allForecastRowData = calculatedData;
              this.applyMissingItemFilter();

              const storageKey = `FORECAST_${this.importPlanningMonth}_${this.importPlanningYear}_${this.importPlanningRevision}`;
              try { localStorage.setItem(storageKey, JSON.stringify(this.forecastRowData)); } catch (e) { console.warn('LocalStorage save failed:', e); }

              this.isCalculating    = false;
              this.showPreviewModal = false;
              this.activeTab        = 'forecast';
              this.clearPlanningFile();
              this.cdr.detectChanges();

              setTimeout(() => {
                if (this.pendingForecastData !== null) {
                  this.forecastRowData     = [...this.pendingForecastData];
                  this.pendingForecastData = null;
                  this.cdr.detectChanges();
                }
              }, 300);
            },
            error: (err) => {
              const calculatedData = this.calculateForecast(mappedOrders, this.previewInventory);
              this.totalAmount = calculatedData.reduce((s: number, d: any) => s + (d.amount || 0), 0);
              const finalGridData = this.processGridData(calculatedData);
              this.pendingForecastData = finalGridData;
              this.isCalculating    = false;
              this.showPreviewModal = false;
              this.activeTab        = 'forecast';
              this.clearPlanningFile();
              this.cdr.detectChanges();

              setTimeout(() => {
                if (this.pendingForecastData !== null) {
                  this.forecastRowData     = [...this.pendingForecastData];
                  this.pendingForecastData = null;
                  this.cdr.detectChanges();
                }
              }, 300);
            }
          });
        },
        error: (err) => {
          this.isCalculating = false;
          this.showPreviewModal = false;
          Swal.fire({
            icon: 'error',
            title: 'Mapping Failed',
            text: `Cannot connect to Master Tooling Database: ${err.message || err}`,
            confirmButtonText: 'OK'
          });
        }
      });
    }, 600);
  }

  runLocalExcelCalculation() {
    if (!this.selectedPlanningFile) return;
    this.parseExcelLocally(this.selectedPlanningFile).then(({ orders, inventory }) => {
      const prev = this.getPreviousMonth(this.importPlanningMonth, this.importPlanningYear);
      this.forecastService.getForecastBalance(prev.prevMonth, prev.prevYear, '').subscribe({
        next: (balances) => {
          this.carryForwardBalances.clear();
          if (balances && balances.length) {
            balances.forEach((b: any) => this.carryForwardBalances.set(String(b.ItemNo).trim().toUpperCase(), Number(b.EndStock)));
          }
          const calculatedData = this.calculateForecast(orders, inventory);
          this.totalAmount     = calculatedData.reduce((s, d) => s + (d.amount || 0), 0);

          const finalGridData = this.processGridData(calculatedData);
          const storageKey = `FORECAST_${this.importPlanningMonth}_${this.importPlanningYear}_${this.importPlanningRevision}`;
          try { localStorage.setItem(storageKey, JSON.stringify(finalGridData)); } catch (e) { console.warn('LocalStorage save failed:', e); }

          this.forecastRowData = finalGridData;
          this.clearPlanningFile();
        },
        error: (err) => {
          const calculatedData = this.calculateForecast(orders, inventory);
          this.totalAmount     = calculatedData.reduce((s, d) => s + (d.amount || 0), 0);
          const finalGridData = this.processGridData(calculatedData);
          this.forecastRowData = finalGridData;
          this.clearPlanningFile();
        }
      });
    }).catch(err => {
      Swal.fire({ icon: 'error', title: 'Calculation Failed', text: err.message || err });
    });
  }

  parseExcelLocally(file: File): Promise<{ orders: any[], inventory: any[] }> {
    return new Promise((resolve, reject) => {
      const normalizeDate = (rawDate: string): string => {
        if (!rawDate) return '';
        let d = rawDate.toString().trim().toUpperCase().replace(/\s+/g, ' ');
        const monthMap: { [key: string]: string } = {
          'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
          'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };
        for (const [mName, mNum] of Object.entries(monthMap)) {
          if (d.includes(mName)) {
            const yearMatch = d.match(/\d{4}/);
            if (yearMatch) {
              return `${yearMatch[0]}-${mNum}-01`;
            }
          }
        }
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-01`;
        }
        return rawDate;
      };

      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

          if (jsonData.length > 0) {
            const firstRow = jsonData[0];
            const getValFromRow = (keys: string[]): any => {
              for (const searchKey of keys) {
                const targetKey = searchKey.toLowerCase().replace(/[\s_\-\/]/g, '');
                for (const key of Object.keys(firstRow)) {
                  const cleanKey = key.toLowerCase().replace(/[\s_\-\/]/g, '');
                  if (cleanKey === targetKey) return firstRow[key];
                }
              }
              return '';
            };
            this.importPlanningMonth = getValFromRow(['monthplan', 'month_plan', 'forecastmonth']) || this.importPlanningMonth;
            this.importPlanningYear = getValFromRow(['yearplan', 'year_plan', 'year', 'forecastyear']) || this.importPlanningYear;

            // The 'Rev' in the Excel file varies per row, but we use the first row's Rev as the Global Plan Revision
            // so the user doesn't have to manually select it.
            this.importPlanningRevision = getValFromRow(['rev', 'revision', 'partrev', 'planrev']) || this.importPlanningRevision;

            // Auto-sync the UI dropdowns with the imported file
            if (this.months.includes(this.importPlanningMonth)) {
              this.selectedMonth = this.importPlanningMonth;
            }
            if (this.years.includes(this.importPlanningYear.toString())) {
              this.selectedYear = this.importPlanningYear.toString();
            }
            if (this.revisions.includes(this.importPlanningRevision)) {
              this.selectedRevision = this.importPlanningRevision;
            }
          }

          const orders: any[] = [];
          const inventory: any[] = [];

          jsonData.forEach((row, idx) => {
            const getVal = (keys: string[], defaultVal: any = 0): any => {
              for (const key of Object.keys(row)) {
                const cleanKey = key.toLowerCase().replace(/[\s_\-\/]/g, '');
                if (keys.some(k => cleanKey === k.toLowerCase().replace(/[\s_\-\/]/g, ''))) return row[key];
              }
              for (const key of Object.keys(row)) {
                const cleanKey = key.toLowerCase().replace(/[\s_\-\/]/g, '');
                if (keys.some(k => cleanKey.includes(k.toLowerCase().replace(/[\s_\-\/]/g, '')) || k.toLowerCase().replace(/[\s_\-\/]/g, '').includes(cleanKey))) return row[key];
              }
              return defaultVal;
            };

            let partNo = getVal(['toolingpartno', 'partno', 'tooling', 'itemno'], `TL-${1000 + idx}`).toString().trim();
            let itemNo = getVal(['itemno', 'tooling'], '').toString().trim();

            const upperItem = itemNo.toUpperCase();
            if (upperItem === '0' || upperItem.startsWith('NO MASTER')) {
              itemNo = '-';
            }

            // 1. TRANSFORM 'OT' to 'T'
            if (partNo.toUpperCase().startsWith('OT-')) {
              partNo = 'T' + partNo.substring(3);
            } else if (partNo.toUpperCase().startsWith('OT') && partNo.length > 2 && !isNaN(Number(partNo[2]))) {
              partNo = 'T' + partNo.substring(2);
            }

            const upperPart = partNo.toUpperCase();

            // 2. FILTER GARBAGE & MISSING SUBSCRIPTS
            if (upperPart === '0' || upperPart.startsWith('NO MASTER')) {
              return; // Skip garbage values
            }

            // Skip T-prefix parts that lack a subscript (e.g. exactly T6025-01)
            const tNoSuffixRegex = /^T\d+-\d+$/;
            if (tNoSuffixRegex.test(upperPart)) {
              return; // Skip this iteration, missing required subscript
            }

            const partQty = Number(getVal(['partqty', 'qty', 'part_qty', 'usage_pcs', 'usagepcs'], 0));
            let working = Number(getVal(['working', 'workday', 'days'], 22));
              if (!working || working <= 0 || isNaN(working)) working = 22;
            const process = getVal(['process'], 'Local Process');
            const mc = getVal(['mc', 'machine'], 'MC-LOCAL');
            const targetMonthRaw = getVal(['month', 'targetmonth'], '');
            const targetMonth = normalizeDate(targetMonthRaw);
            const partRev = getVal(['rev', 'revision', 'partrev'], '');
            const yearPlan = getVal(['yearplan', 'year_plan'], '');
            const monthPlan = getVal(['monthplan', 'month_plan'], '');

            // Raw order parsing ONLY (No Master Mapping here)
            orders.push({
              orderId: getVal(['orderid', 'orderno'], `ORD-LOCAL-${1000 + idx}`),
              partNo: partNo,
              itemNo: itemNo || '-',
              partQty: partQty,
              working: working,
              process: process,
              mc: mc,
              targetMonth: targetMonth,
              partRev: partRev,
              yearPlan: yearPlan,
              monthPlan: monthPlan,
              ctSec: Number(getVal(['ctsec', 'ct_sec', 'cycletime'], 0)),
              initialItemQty: Number(getVal(['itemqty', 'initialitemqty', 'initial_qty'], 0))
            });

            inventory.push({
              itemNo: itemNo || '-',
              onHand: 0,
              po: 0,
              pr: 0,
              unitPrice: Number(getVal(['unitprice', 'price', 'unit_price'], 0))
            });
          });

          resolve({ orders, inventory });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  clearPlanningFile() {
    this.selectedPlanningFile = null;
    const fileInput = document.getElementById('planningFileInput') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  // --- Tab 4 Functions ---
  deleteData() {
    Swal.fire({
      title: 'Purge Table Confirmation',
      text: 'Are you sure you want to permanently purge all data from "dbo.PartItem2" on PBGM8G? This action cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, Purge it!',
      cancelButtonText: 'Cancel',
      customClass: {
        confirmButton: 'btn btn-danger me-2',
        cancelButton: 'btn btn-secondary'
      },
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: 'Purging File Records...',
          text: 'Executing delete query on table dbo.PartItem2 on PBGM8G...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        this.masterPHService.purgePartItem2().subscribe({
          next: () => {
            Swal.close();
            Swal.fire({
              icon: 'success',
              title: 'Purged!',
              text: 'Table "dbo.PartItem2" on PBGM8G has been successfully purged.',
              confirmButtonText: 'Finished',
              customClass: {
                confirmButton: 'btn btn-success'
              }
            });
          },
          error: (err) => {
            Swal.close();
            Swal.fire({
              icon: 'error',
              title: 'Purge Failed',
              text: err.error?.message || err.error?.error || 'Error occurred while purging the table.',
              confirmButtonText: 'OK',
              customClass: {
                confirmButton: 'btn btn-danger'
              }
            });
          }
        });
      }
    });
  }

  exportToExcel() {
    if (this.forecastRowData.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: '\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25',
        text: '\u0e01\u0e23\u0e38\u0e13\u0e32\u0e04\u0e33\u0e19\u0e27\u0e13\u0e2b\u0e23\u0e37\u0e2d\u0e42\u0e2b\u0e25\u0e14\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25 Forecast \u0e01\u0e48\u0e2d\u0e19 Export',
        confirmButtonText: 'OK',
                customClass: { confirmButton: 'btn btn-warning' }
      });
      return;
    }

    // 1. ฿฿฿§฿฿฿฿฿ŵ฿฿ Part_No
    const sorted = [...this.forecastRowData].sort((a, b) => {
      const pa = String(a.tooling || a.partNo || '');
      const pb = String(b.tooling || b.partNo || '');
      return pa < pb ? -1 : (pa > pb ? 1 : 0);
    });

    // 2. Header columns
    const HEADERS = [
      'Part_No', 'Part_qty', 'Working_days', 'CT_sec',
      'MC_qty', 'Initial_Item_qty', 'Final_Item_qty',
      'Difference', 'Unit_Price', 'Total_Amount'
    ];

    // 3. Build worksheet object manually (for formula support)
    const wb  = XLSX.utils.book_new();
    const ws: any = {};

    // Header row (row 0 = Excel row 1)
    HEADERS.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: h, t: 's' };
    });

    // Data rows start at Excel row 2 (r=1)
    sorted.forEach((row, i) => {
      const r        = i + 1;           // 0-indexed row
      const excelRow = i + 2;           // 1-indexed Excel row number
      const initial  = row.initialItemQty ?? 0;
      const final_   = row.reqQty        ?? 0;
      const adjusted = final_ > initial;

      const cells: any[] = [
        { v: row.tooling || row.partNo || '', t: 's' },  // A Part_No
        { v: row.partQty  ?? 0, t: 'n' },                // B Part_qty
        { v: row.working  ?? 0, t: 'n' },                // C Working_days
        { v: row.ctSec    ?? 0, t: 'n' },                // D CT_sec
        { v: row.mcQty    ?? 0, t: 'n' },                // E MC_qty
        { v: initial,           t: 'n' },                // F Initial_Item_qty
        { v: final_,            t: 'n' },                // G Final_Item_qty
        { f: `G${excelRow}-F${excelRow}`, t: 'n' },     // H Difference (formula)
        { v: row.unitPrice ?? 0, t: 'n' },              // I Unit_Price
        { f: `G${excelRow}*I${excelRow}`, t: 'n' }      // J Total_Amount (formula)
      ];

      cells.forEach((cell, c) => {
        ws[XLSX.utils.encode_cell({ r, c })] = cell;
      });
    });

    // 4. TOTAL summary row
    const totalR   = sorted.length + 1;   // 0-indexed
    const lastData = sorted.length + 1;   // Excel row number of last data row
    const totalCells: any[] = [
      { v: 'TOTAL', t: 's' }, { v: '', t: 's' }, { v: '', t: 's' }, { v: '', t: 's' },
      { v: '', t: 's' }, { v: '', t: 's' }, { v: '', t: 's' },
      { f: `SUM(H2:H${lastData})`, t: 'n' },   // H Difference total
      { v: '', t: 's' },
      { f: `SUM(J2:J${lastData})`, t: 'n' }    // J Total_Amount total
    ];
    totalCells.forEach((cell, c) => {
      ws[XLSX.utils.encode_cell({ r: totalR, c })] = cell;
    });

    // 5. Sheet range & column widths
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalR, c: 9 } });
    ws['!cols'] = [
      { wch: 20 }, { wch: 12 }, { wch: 13 }, { wch: 9  },
      { wch: 9  }, { wch: 16 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }
    ];

    // 6. File name with date stamp (YYYYMMDD)
    const today    = new Date();
    const datePart = today.getFullYear().toString()
      + String(today.getMonth() + 1).padStart(2, '0')
      + String(today.getDate()).padStart(2, '0');
    const fileName = `Forecast_Report_${datePart}.xlsx`;

    XLSX.utils.book_append_sheet(wb, ws, 'Forecast Report');
    XLSX.writeFile(wb, fileName);

    Swal.fire({
      icon: 'success',
      title: 'Export \u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08!',
      html: `บันทึกไฟล์ <b>${fileName}</b><br><small class="text-muted">${sorted.length} รายการ เรียงตาม Part_No</small>`,
      timer: 2500,
      showConfirmButton: false
    });
  }

  sendToVendor() {
    if (!this.purchaseGridApi) return;
    const selectedNodes = this.purchaseGridApi.getSelectedNodes();
    if (selectedNodes.length === 0) {
      Swal.fire('No items selected', 'Please select items to order first.', 'warning');
      return;
    }

    Swal.fire({
      icon: 'question',
      title: 'Confirm Send Order?',
      html: `You are about to send <b class="text-primary">${selectedNodes.length} item(s)</b> to the Vendor tab.<br>Do you want to proceed?`,
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: '<i class="bi bi-check-circle-fill me-1"></i> Confirm',
      cancelButtonText: '<i class="bi bi-x-circle-fill me-1"></i> Cancel',
      reverseButtons: true,
      customClass: {
        confirmButton: 'btn btn-success px-4 rounded-pill shadow-sm ms-2',
        cancelButton: 'btn btn-secondary px-4 rounded-pill shadow-sm'
      },
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        selectedNodes.forEach((node: any) => {
          if (node.data) {
            node.data.inCart = true;
          }
        });

        this.purchaseGridApi.applyTransaction({ update: selectedNodes.map((n: any) => n.data) });
        this.purchaseGridApi.deselectAll();

        Swal.fire({
          icon: 'success',
          title: 'Added to Vendor List',
          text: `Successfully added ${selectedNodes.length} item(s) to the Vendor tab.`,
          timer: 1500,
          showConfirmButton: false
        });
      }
    });
  }

  exportVendorExcel() {
    if (!this.purchaseGridApi) return;
    const exportData: any[] = [];
    let rowIndex = 1;

    // Use forEachNodeAfterFilterAndSort to export exactly what is visible on the screen
    // in the exact same sorted order, without relying on the inCart property which might
    // behave differently for pre-loaded data.
    this.purchaseGridApi.forEachNodeAfterFilterAndSort((node: any) => {
      if (node.data) {
        const confirmQty = Number(node.data.confirmQty) || 0;

        if (confirmQty <= 0) return; // Skip items with no order quantity

        const unitPrice = Number(node.data.unitPrice) || 0;
        const amount = confirmQty * unitPrice;

        exportData.push({
          'No': rowIndex++,
          'Item No': node.data.itemNo || '',
          'Name': node.data.name || '',
          'Spec': node.data.spec || '',
          'Part No': node.data.partNo || '',
          'Delivery Date': node.data.dueDate || '-',
          'Order Qty': confirmQty,
          'Unit Price / Pcs': unitPrice,
          'Total Price': amount,
          'Vendor Code': node.data.vendorCode || '',
          'Vendor Name': node.data.vendorName || ''
        });
      }
    });

    if (exportData.length === 0) {
      Swal.fire('Empty List', 'No items found to export.', 'info');
      return;
    }

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(exportData);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Orders');
    XLSX.writeFile(wb, 'Vendor_Orders.xlsx');
  }

  onCellClicked(event: any) {
    // Disabled avgUsage click detail as requested
    // if (event.colDef.field === 'avgUsage' && event.data.itemNo) {
    //   this.showAuditLog(event.data.itemNo, event.data.avgUsage, event.data.achieveRate, event.data.pB, event.data.advanceAchieveRate);
    // }
  }

  showAuditLog(itemNo: string, avgUsage: number, achieveRate: number, pB: number, advanceAchieveRate: number) {
    Swal.fire({
      title: 'กำลังโหลดข้อมูล...',
      text: 'กรุณารอสักครู่',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.forecastService.getToolingUsageAudit(itemNo).subscribe({
      next: (res: any) => {
        if (!res || !res.records) {
          Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลประวัติการเบิก', 'error');
          return;
        }

        let tableRows = '';
        res.records.forEach((r: any, idx: number) => {
          const isExcluded = r.isExcluded;
          const rowColor = isExcluded ? '#ffebee' : '#e8f5e9';
          const statusText = isExcluded ? '<span class="badge bg-danger">ตัดทิ้ง</span>' : '<span class="badge bg-success">นำมาคำนวณ</span>';

          tableRows += `
            <tr style="background-color: ${rowColor};">
              <td class="text-center">${idx + 1}</td>
              <td>${r.part_name || '-'}</td>
              <td class="text-center">${r.tooling_status || '-'}</td>
              <td class="text-end fw-bold">${(r.total_usage || 0).toLocaleString()}</td>
              <td class="text-center">${statusText}</td>
              <td style="font-size: 0.85rem; color: #555;">${r.exclusionReason || 'อยู่ในเกณฑ์ปกติ'}</td>
            </tr>
          `;
        });

        const htmlContent = `
          <div style="text-align: left; font-size: 0.95rem;">
            <div class="alert alert-primary mb-3">
              <strong>สรุปข้อมูลเบื้องต้น</strong><br>
              - จำนวนบิลทั้งหมด (Total Records): ${res.summary.totalRecords} บิล<br>
              - <span class="text-success fw-bold">นำมาคำนวณ (Included): ${res.summary.includedCount} บิล</span><br>
              - <span class="text-danger fw-bold">ตัดทิ้งเพราะเป็นข้อมูลขยะ (Excluded): ${res.summary.excludedCount} บิล</span>
            </div>

            <div class="table-responsive" style="max-height: 400px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 4px;">
              <table class="table table-bordered table-sm table-hover mb-0">
                <thead class="table-light sticky-top">
                  <tr>
                    <th class="text-center">No.</th>
                    <th>Part Name</th>
                    <th class="text-center">Status</th>
                    <th class="text-end">ยอดใช้งาน</th>
                    <th class="text-center">การนำไปคำนวณ</th>
                    <th>เหตุผล (Reason)</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>

            <div class="alert alert-success mt-3 mb-0">
              <strong>สรุปผลการคำนวณ (Final Math)</strong><br>
              <div class="d-flex justify-content-between border-bottom pb-2 pt-2">
                <span>ยอดรวมบิลที่นำมาคำนวณ (Sum):</span>
                <strong>${res.summary.sumIncludedUsage.toLocaleString()}</strong>
              </div>
              <div class="d-flex justify-content-between border-bottom pb-2 pt-2">
                <span>หารด้วยจำนวนบิล (Count):</span>
                <strong>${res.summary.includedCount}</strong>
              </div>
              <div class="d-flex justify-content-between pt-2">
                <span class="text-primary fw-bold">ค่าเฉลี่ยที่แท้จริง (Avg Usage):</span>
                <strong class="text-primary fs-5">${(res.summary.finalAvgUsage || 0).toLocaleString()}</strong>
              </div>

              <hr class="my-2">
              <strong class="text-secondary">การคำนวณ Advance Achieve Rate</strong><br>
              <small class="text-muted">
                Broken Rate = (Usage + Burr) / บิลทั้งหมด = ${res.summary.usageCaseCount} / ${res.summary.totalRecords} = ${res.summary.pB.toFixed(4)}<br>
                Advance Achieve Rate = Broken Rate &times; Achieve Rate = ${res.summary.pB.toFixed(4)} &times; ${(res.summary.ratio * 100).toFixed(2)}% = <strong>${res.summary.advanceAchieveRate.toFixed(2)}%</strong>
              </small>
            </div>
          </div>
        `;

        Swal.fire({
          title: `รายงานการคำนวณเชิงลึก (Audit Log) <br> รหัส ${itemNo}`,
          html: htmlContent,
          width: '850px',
          confirmButtonText: 'ปิด',
          confirmButtonColor: '#6c757d'
        });
      },
      error: (err) => {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลได้: ' + err.message, 'error');
      }
    });
  }
}









