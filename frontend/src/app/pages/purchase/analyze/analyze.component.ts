import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { NgSelectModule } from '@ng-select/ng-select';
import { RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';

import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AnalyzeService } from '../../../core/services/analyze.service';
import { SidebarPurchaseComponent } from '../../../components/sidebar/sidebarPurchase.component';
import { Chart, registerables, ChartDataset, ChartConfiguration } from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import * as XLSX from 'xlsx'
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';


@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [
    NgSelectModule,
    FormsModule,
    CommonModule,
    SidebarPurchaseComponent,
  ],

  templateUrl: './analyze.component.html',
  styleUrls: ['./analyze.component.scss']
})
export class AnalyzeComponent implements OnInit, AfterViewInit {

  public data: any[] = [];
  public loading: boolean = false;
  public error: string = '';
  public dataFromDB: any[] = [];

  // mapping division id to name
  private divisionMap: { [key: string]: string } = {
    '7122': 'GM',
    '71DZ': 'PMC'
  };

  // ตัวเลือก dropdown
  divisions = [
    { id: '7122', name: 'GM' },
    { id: '71DZ', name: 'PMC' }
  ];

  selectedCostDivision: string = 'ALL';

  selectedDivisions: string[] = []; // เก็บ division ที่เลือก
  chart: Chart | null = null;

  partNos: string[] = [];           // เก็บ list PartNo
  selectedPartNo: string = '';     // ค่า PartNo ที่เลือก (ค่าเดียว)


  itemNos: string[] = [];
  selectedItemNos: string[] = []; // เก็บ ItemNo ที่เลือก
  uniqueItemNos: string[] = [];   // เก็บ ItemNo ALL
  chartInstance: any;

  topN1: number = 10;
  topN: number = 10; // ค่าเริ่มต้น
  Divisions: string[] = [];
  Cases: string[] = [];
  Process: string[] = [];

  selectedDivision: string = 'ALL';
  selectedDivisionStacked: string = 'ALL';
  selectedCase: string = 'ALL';
  uniqueCases: string[] = [];
  selectedCaseall: string = 'ALL';
  selectedprocess: string = 'ALL';
  uniqueprocess: string[] = [];
  selectedprocesshoz: string = 'ALL';

  // Item Name filter for Most Item Select chart
  uniqueItemNames: string[] = [];
  selectedItemNameHoz: string = 'ALL';

  // Item Name filter for Cost Analyze chart
  uniqueCostItemNames: string[] = [];
  selectedItemNameCombo: string = 'ALL';

  // Map SPEC -> ItemName for display in chart labels
  specToItemNameMap: { [spec: string]: string } = {};

  public pieChart: Chart | null = null;
  public horizontalBarChart: Chart | null = null;
  public stackedBarChart: Chart | null = null; // ถ้ามี stacked bar
  public comboChart: Chart | null = null; // ✅ เพิ่ม Combo Chart

  public costData: any[] = []; // ข้อมูลจาก getcostanalyze
  public comboSortBy: 'qty' | 'price' = 'qty'; // Default เรียงตามจำนวน
  public comboTopN: number = 10; // Default Top N สำหรับ Combo Chart
  public costDateStart: string | null = null;
  public costDateEnd: string | null = null;

  // Overview Charts Date Filter
  public overviewDateStart: string | null = null;
  public overviewDateEnd: string | null = null;

  // Summary Cards
  public totalCostTHB: number = 0;
  public mostExpensiveTool: { name: string; itemName: string; cost: number } = { name: '-', itemName: '', cost: 0 };
  public mostUsedCase: { name: string; count: number } = { name: '-', count: 0 };

  // Cost Stacked Bar
  public costStackedBarChart: Chart | null = null;
  public costStackedGroupBy: 'Division' | 'CASE' | 'Process' = 'Division';
  public costStackedValueType: 'qty' | 'price' = 'price';

  // Item Life Cycle
  public lifecycleData: {
    itemNo: string;
    spec: string;
    division: string;
    totalRequests: number;
    totalQty: number;
    avgDays: number;
    alert: 'high' | 'medium' | 'normal';
  }[] = [];
  public lifecycleSortBy: string = 'avgDays';
  public lifecycleSortDir: 'asc' | 'desc' = 'asc';

  // Trend Analysis
  public trendChart: Chart | null = null;
  public trendViewMode: 'monthly' | 'daily' = 'monthly';

  // Most Item Select date filters
  public mostItemMonthYear: string | null = null;
  public availableYears: string[] = [];

  // Global Filters
  public globalDivision: string = 'ALL';
  public globalDateStart: string | null = null;
  public globalDateEnd: string | null = null;

  constructor(
    private analyzeService: AnalyzeService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadData();
    }
  }

  loadData() {
    this.analyzeService.getdataall().subscribe({
      next: (response: any[]) => {
        this.data = response;
        this.uniqueItemNos = Array.from(new Set(this.data.map(d => d.ItemNo)));
        this.Cases = Array.from(new Set(this.data.map(c => c.CASE)));
        // console.log(this.Cases);
        this.renderHorizontalBarChart();
        this.fetchAnalyzeData();
        this.dataFromDB = response;
      },
      error: (err) => {
        console.error(err);
      }
    });
  }

  onItemNoChange() {
    this.renderHorizontalBarChart();
  }
  ngAfterViewInit(): void {
    // DOM พร้อมแล้ว เรียก API
    this.fetchAnalyzeData();
    this.fetchCostAnalyzeData(); // ✅ โหลดข้อมูล Combo Chart
  }

  getDivisionLabel(divId: string): string {
    if (!divId || divId === 'ALL') return 'All Divisions';
    return this.divisionMap[divId] || divId;
  }

  fetchAnalyzeData() {
    this.loading = true;
    this.analyzeService.getdataall().subscribe({
      next: (response: any[]) => {
        this.data = response;

        //  หาค่า Case ไม่ซ้ำ
        this.uniqueCases = Array.from(new Set(this.data.map(d => d.CASE)));

        this.uniqueprocess = Array.from(new Set(this.data.map(d => d.Process)));

        // console.log('Cases:', this.uniqueCases);

        //  หาค่า Division ไม่ซ้ำ
        const divisionSet = new Set<string>();
        this.data.forEach(item => divisionSet.add(item.Division || 'อื่นๆ'));
        this.Divisions = Array.from(divisionSet);

        // หาค่าปีที่มีในข้อมูล
        const yearSet = new Set<string>();
        this.data.forEach(item => {
          if (item.DateComplete) yearSet.add(String(new Date(item.DateComplete).getFullYear()));
        });
        this.availableYears = Array.from(yearSet).sort();

        const caseSet = new Set<string>();
        this.data.forEach(item => caseSet.add(item.CASE || 'อื่นๆ'));
        this.Cases = Array.from(caseSet);

        const processSet = new Set<string>();
        this.data.forEach(item => processSet.add(item.Process || 'อื่นๆ'));
        this.Process = Array.from(processSet);

        // Build SPEC -> ItemName map and unique item names for filter
        const itemNameSet = new Set<string>();
        this.data.forEach(item => {
          const spec = item.SPEC || '';
          const name = item.ItemName || item.Description || '';
          if (spec && name) {
            this.specToItemNameMap[spec] = name;
          }
          if (name) itemNameSet.add(name);
        });
        this.uniqueItemNames = Array.from(itemNameSet).sort();

        // ค่า default dropdown
        if (!this.selectedDivision) this.selectedDivision = 'ALL';

        this.loading = false;

        // วาดกราฟ
        this.renderStackedBarChart();
        this.renderHorizontalBarChart();
      },
      error: (err) => {
        console.error(err);
        this.error = 'ไม่สามารถโหลดข้อมูลได้';
        this.loading = false;
      }
    });
  }

  fetchCostAnalyzeData() {
    this.loading = true;
    this.analyzeService.getcostanalyze().subscribe({
      next: (response: any[]) => {
        this.costData = response;
        this.loading = false;

        // Build SPEC -> ItemName map also from cost data
        const costItemNameSet = new Set<string>();
        this.costData.forEach(item => {
          const spec = item.SPEC || '';
          const name = item.ItemName || item.Description || '';
          if (spec && name) {
            this.specToItemNameMap[spec] = name;
          }
          if (name) costItemNameSet.add(name);
        });
        this.uniqueCostItemNames = Array.from(costItemNameSet).sort();

        this.calculateSummaryCards();
        this.renderComboChart();
        this.renderCostStackedBar();
        this.computeLifecycleData();
        this.renderTrendChart();
      },
      error: (err) => {
        console.error("Error fetching cost analyze data:", err);
        this.loading = false;
      }
    });
  }

  applyCostFilters() {
    this.calculateSummaryCards();
    this.renderComboChart();
    this.renderCostStackedBar();
  }

  clearCostDate() {
    this.costDateStart = null;
    this.costDateEnd = null;
    this.applyCostFilters();
  }

  clearMostItemDate() {
    this.mostItemMonthYear = null;
    this.renderHorizontalBarChart();
  }

  // ============== Global Filter Methods ==============

  applyGlobalFilters() {
    // Sync global division to local ones if needed, or just let the getters handle it
    // For simplicity, we'll let the refactored getters prioritize global values
    this.calculateSummaryCards();
    this.renderStackedBarChart();
    this.renderHorizontalBarChart();
    this.renderComboChart();
    this.renderTrendChart();
  }

  resetGlobalFilters() {
    this.globalDivision = 'ALL';
    this.globalDateStart = null;
    this.globalDateEnd = null;

    // Also reset local specific filters to defaults
    this.selectedDivision = 'ALL';
    this.selectedCostDivision = 'ALL';
    this.overviewDateStart = null;
    this.overviewDateEnd = null;
    this.costDateStart = null;
    this.costDateEnd = null;
    this.mostItemMonthYear = null;
    this.selectedDivisions = [];
    this.selectedDivisionStacked = 'ALL';

    this.applyGlobalFilters();
  }

  applyOverviewFilters() {
    this.renderStackedBarChart();
    this.renderHorizontalBarChart();
    this.renderStatusChart();
  }

  clearOverviewDate() {
    this.overviewDateStart = null;
    this.overviewDateEnd = null;
    this.applyOverviewFilters();
  }

  getFilteredOverviewData(): any[] {
    let filteredData = this.data || [];

    // Apply Global Division if not ALL
    if (this.globalDivision !== 'ALL') {
      filteredData = filteredData.filter(item => (item.Division || 'อื่นๆ') === this.globalDivision);
    }

    // Use Global Date if set, otherwise use local overview dates
    let startDateStr = this.globalDateStart || this.overviewDateStart;
    let endDateStr = this.globalDateEnd || this.overviewDateEnd;

    let startDate = startDateStr ? new Date(startDateStr) : null;
    let endDate = endDateStr ? new Date(endDateStr) : null;

    // ถ้าเลือกแค่วันเดียว (ช่องใดช่องหนึ่ง) ให้เหมารีพอร์ตวันนั้นวันเดียว
    if (startDate && !endDate) {
      endDate = new Date(startDate);
    } else if (!startDate && endDate) {
      startDate = new Date(endDate);
    }

    if (startDate) {
      filteredData = filteredData.filter(item => new Date(item.DateComplete) >= startDate!);
    }
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
      filteredData = filteredData.filter(item => new Date(item.DateComplete) <= endDate!);
    }

    return filteredData;
  }

  getFilteredCostData(): any[] {
    // Logic: If globalDivision is set, use it. Otherwise use selectedCostDivision.
    const activeDivision = this.globalDivision !== 'ALL' ? this.globalDivision : this.selectedCostDivision;

    let filteredData = activeDivision === 'ALL'
      ? this.costData
      : this.costData.filter(d => d.Division === activeDivision);

    // Use Global Date if set, otherwise use local cost dates
    let startDateStr = this.globalDateStart || this.costDateStart;
    let endDateStr = this.globalDateEnd || this.costDateEnd;

    let startDate = startDateStr ? new Date(startDateStr) : null;
    let endDate = endDateStr ? new Date(endDateStr) : null;

    // ถ้าเลือกแค่วันเดียว (ช่องใดช่องหนึ่ง) ให้เหมารีพอร์ตวันนั้นวันเดียว
    if (startDate && !endDate) {
      endDate = new Date(startDate);
    } else if (!startDate && endDate) {
      startDate = new Date(endDate);
    }

    if (startDate) {
      filteredData = filteredData.filter(item => new Date(item.DateComplete) >= startDate!);
    }
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
      filteredData = filteredData.filter(item => new Date(item.DateComplete) <= endDate!);
    }

    return filteredData;
  }

  calculateSummaryCards() {
    if (!this.costData || this.costData.length === 0) return;

    const filteredData = this.getFilteredCostData();

    // 1. คำนวณยอดรวมต้นทุนทั้งหมด
    this.totalCostTHB = filteredData.reduce((sum, item) => sum + (Number(item.Total_Price_THB) || 0), 0);

    // 2. หา Tooling ที่แพงที่สุด (นับตาม SPEC หรือ ItemNo แล้วรวมราคา)
    const toolCostMap: { [spec: string]: number } = {};
    const caseCountMap: { [c: string]: number } = {};

    filteredData.forEach(item => {
      // สำหรับ Most Expensive Tool (รวมมูลค่า THB)
      const spec = item.SPEC || 'ไม่ระบุ';
      toolCostMap[spec] = (toolCostMap[spec] || 0) + (Number(item.Total_Price_THB) || 0);

      // สำหรับ Most Used Case (นับจำนวนครั้งหรือเบิกใช้ QTY, ในที่นี้สมมติเป็นยอด QTY รวม)
      const c = item.CASE || 'ไม่ระบุ';
      caseCountMap[c] = (caseCountMap[c] || 0) + (Number(item.QTY) || 0);
    });

    // หา Tool ที่ยอดรวมแพงสุด
    let maxCost = 0;
    let maxTool = '-';
    for (const [spec, cost] of Object.entries(toolCostMap)) {
      if (cost > maxCost) {
        maxCost = cost;
        maxTool = spec;
      }
    }
    const maxToolItemName = this.specToItemNameMap[maxTool] || '';
    this.mostExpensiveTool = { name: maxTool, itemName: maxToolItemName, cost: maxCost };

    // หา Case ที่ถูกใช้เยอะที่สุด (QTY)
    let maxQty = 0;
    let maxCase = '-';
    for (const [c, qty] of Object.entries(caseCountMap)) {
      if (qty > maxQty) {
        maxQty = qty;
        maxCase = c;
      }
    }
    this.mostUsedCase = { name: maxCase, count: maxQty };
  }

  // ============== Item Life Cycle / Re-order Alert ==============
  computeLifecycleData() {
    if (!this.costData || this.costData.length === 0) return;

    // Use filtered data
    const filteredData = this.getFilteredCostData();

    // Group by ItemNo
    const groups: { [key: string]: any[] } = {};
    filteredData.forEach(item => {
      const key = item.ItemNo || 'N/A';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const result: typeof this.lifecycleData = [];

    for (const [itemNo, items] of Object.entries(groups)) {
      // Sort by DateComplete ascending
      const sorted = items
        .filter(i => i.DateComplete)
        .sort((a, b) => new Date(a.DateComplete).getTime() - new Date(b.DateComplete).getTime());

      const totalRequests = sorted.length;
      const totalQty = items.reduce((s, i) => s + (Number(i.QTY) || 0), 0);
      const spec = items[0]?.SPEC || '-';
      const division = items[0]?.Division || '-';

      let avgDays = -1; // -1 = only 1 request, can't compute
      if (sorted.length >= 2) {
        const diffs: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          const d1 = new Date(sorted[i - 1].DateComplete).getTime();
          const d2 = new Date(sorted[i].DateComplete).getTime();
          diffs.push((d2 - d1) / (1000 * 60 * 60 * 24)); // days
        }
        avgDays = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
      }

      let alert: 'high' | 'medium' | 'normal' = 'normal';
      if (avgDays >= 0 && avgDays <= 7) alert = 'high';
      else if (avgDays >= 8 && avgDays <= 21) alert = 'medium';

      result.push({ itemNo, spec, division, totalRequests, totalQty, avgDays, alert });
    }

    // Default sort: avgDays ascending (most frequent first), items with only 1 request go last
    result.sort((a, b) => {
      if (a.avgDays === -1 && b.avgDays === -1) return 0;
      if (a.avgDays === -1) return 1;
      if (b.avgDays === -1) return -1;
      return a.avgDays - b.avgDays;
    });

    this.lifecycleData = result;
  }

  sortLifecycle(column: string) {
    if (this.lifecycleSortBy === column) {
      this.lifecycleSortDir = this.lifecycleSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.lifecycleSortBy = column;
      this.lifecycleSortDir = 'asc';
    }

    const dir = this.lifecycleSortDir === 'asc' ? 1 : -1;
    this.lifecycleData.sort((a: any, b: any) => {
      const va = a[column];
      const vb = b[column];
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      // Push -1 (single request) to the end
      if (va === -1 && vb === -1) return 0;
      if (va === -1) return 1;
      if (vb === -1) return -1;
      return (va - vb) * dir;
    });
  }

  // ============== Trend Analysis (Line Chart) ==============
  renderTrendChart() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('trendChart') as HTMLCanvasElement;

    // Use filtered data
    const filteredData = this.getFilteredCostData();
    if (!canvas || !filteredData.length) return;

    if (this.trendChart) this.trendChart.destroy();

    const isMonthly = this.trendViewMode === 'monthly';

    // Group data by time period
    const grouped: { [key: string]: { cost: number; qty: number } } = {};

    filteredData.forEach(item => {
      if (!item.DateComplete) return;
      const d = new Date(item.DateComplete);
      const key = isMonthly
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (!grouped[key]) grouped[key] = { cost: 0, qty: 0 };
      grouped[key].cost += Number(item.Total_Price_THB) || 0;
      grouped[key].qty += Number(item.QTY) || 0;
    });

    // Sort by date key
    const sortedKeys = Object.keys(grouped).sort();
    const labels = sortedKeys.map(k => {
      if (isMonthly) {
        const [y, m] = k.split('-');
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        return `${months[parseInt(m) - 1]} ${y}`;
      }
      return k;
    });
    const costValues = sortedKeys.map(k => grouped[k].cost);
    const qtyValues = sortedKeys.map(k => grouped[k].qty);

    this.trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'มูลค่ารวม (THB)',
            data: costValues,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y',
          },
          {
            label: 'จำนวนเบิก (QTY)',
            data: qtyValues,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          title: {
            display: true,
            text: isMonthly ? 'Monthly Cost & Usage Trend' : 'Daily Cost & Usage Trend',
            font: { size: 14, weight: 'bold' }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y ?? 0;
                if (ctx.datasetIndex === 0) {
                  return `มูลค่า: ฿${val.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
                }
                return `จำนวน: ${val.toLocaleString('th-TH')} ชิ้น`;
              }
            }
          },
          datalabels: { display: false }
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'THB (บาท)' },
            ticks: {
              callback: (v: any) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v
            },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'QTY (ชิ้น)' },
            grid: { drawOnChartArea: false }
          },
          x: {
            ticks: {
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: isMonthly ? 24 : 31
            }
          }
        }
      }
    });
  }

  renderComboChart() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('comboChart') as HTMLCanvasElement;
    if (!canvas || !this.costData?.length) return;

    // 1. จัดกลุ่มข้อมูลตาม SPEC (หรือ ItemNo) เพื่อรวม QTY และ Total_Price_THB
    const aggregatedData: { [spec: string]: { qty: number, totalPrice: number, unitPrice: number } } = {};

    const filteredData = this.getFilteredCostData().filter(item => {
      if (this.selectedItemNameCombo === 'ALL') return true;
      const name = item.ItemName || item.Description || '';
      return name === this.selectedItemNameCombo;
    });

    filteredData.forEach(item => {
      const spec = item.SPEC || 'ไม่ระบุ';
      const qty = Number(item.QTY) || 0;
      const price = Number(item.Total_Price_THB) || 0;
      const unitPrice = Number(item.UnitPrice_Bath) || 0;

      if (!aggregatedData[spec]) {
        aggregatedData[spec] = { qty: 0, totalPrice: 0, unitPrice: unitPrice };
      }
      // Keep the first non-zero unit price found
      if (aggregatedData[spec].unitPrice === 0 && unitPrice > 0) {
        aggregatedData[spec].unitPrice = unitPrice;
      }
      aggregatedData[spec].qty += qty;
      aggregatedData[spec].totalPrice += price;
    });

    // 2. แปลงเป็น Array แล้วเรียงลำดับตามที่ User เลือก
    let sortedData = Object.entries(aggregatedData);

    if (this.comboSortBy === 'qty') {
      sortedData.sort((a, b) => b[1].qty - a[1].qty); // เรียงจาก QTY มากไปน้อย
    } else {
      sortedData.sort((a, b) => b[1].totalPrice - a[1].totalPrice); // เรียงจาก Price มากไปน้อย
    }

    // ตัดเอาเฉพาะ Top N
    sortedData = sortedData.slice(0, this.comboTopN);

    const labels = sortedData.map(d => {
      const spec = d[0]; // ชื่อ SPEC
      const name = this.specToItemNameMap[spec];
      return name ? `${spec} (${name})` : spec;
    });
    const dataQty = sortedData.map(d => d[1].qty); // จำนวน
    const dataPrice = sortedData.map(d => d[1].totalPrice); // ราคา
    const dataUnitPrice = sortedData.map(d => d[1].unitPrice); // ราคาต่อหน่วย

    if (this.comboChart) this.comboChart.destroy();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 3. สร้าง UI สวยๆ (Gradient) สำหรับ Bar Chart
    const gradientBar = ctx.createLinearGradient(0, 0, 0, 400);
    gradientBar.addColorStop(0, 'rgba(54, 162, 235, 0.8)'); // สีน้ำเงินเข้มด้านบน
    gradientBar.addColorStop(1, 'rgba(54, 162, 235, 0.2)'); // สีน้ำเงินอ่อนด้านล่าง

    // 4. สร้าง Combo Chart
    this.comboChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            type: 'bar',
            label: 'จำนวนเบิกใช้ (QTY)',
            data: dataQty,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            order: 2, // 🌟 วาดแท่งให้อยู่ด้านหลัง (Layer ต่ำกว่า)
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'มูลค่ารวม (THB)',
            data: dataPrice,
            borderColor: '#ff6384',
            backgroundColor: '#ff6384',
            borderWidth: 2,
            tension: 0, // ทำให้เส้นตรง ไม่โค้ง
            pointBackgroundColor: '#ff6384',
            pointBorderColor: '#ff6384',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: false,
            order: 1, // 🌟 วาดเส้นให้อยู่ด้านหน้า (Layer สูงกว่า ทับแท่ง)
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            display: true,
            text: 'Top Tooling Usage vs Cost'
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  // ถ้าเป็นเส้นราคา ให้ใส่ลูกน้ำ
                  if (context.dataset.type === 'line') {
                    label += context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ฿';
                  } else {
                    label += context.parsed.y + ' ชิ้น';
                  }
                }
                return label;
              },
              footer: function (tooltipItems) {
                const dataIndex = tooltipItems[0]?.dataIndex;
                if (dataIndex === undefined) return '';
                const unitPrice = dataUnitPrice[dataIndex];
                if (!unitPrice) return '';
                return `💰 ราคาต่อหน่วย: ${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿/ชิ้น`;
              }
            }
          },
          datalabels: {
            display: false // ปิด Datalabel ไว้ก่อนเพราะ 2 แกนซ้อนกันอาจจะรก
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'จำนวน (QTY)',
              font: {
                family: "'Inter', 'Segoe UI', sans-serif",
                weight: 'bold'
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            },
            ticks: {
              precision: 0 // บังคับแสดงเฉพาะจำนวนเต็ม (ไม่มีทศนิยม)
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'ราคารวม (THB)',
              font: {
                family: "'Inter', 'Segoe UI', sans-serif",
                weight: 'bold'
              }
            },
            grid: {
              drawOnChartArea: false,
            },
          },
          x: {
            grid: {
              display: false // ซ่อนเส้นตารางแนวตั้งให้ดูสะอาดตา
            },
            ticks: {
              font: {
                family: "'Inter', 'Segoe UI', sans-serif"
              }
            }
          }
        }
      },
      // ต้องลบปลั๊กอิน Datalabels ออกเฉพาะกราฟนี้ถ้ามันรก
      // หรือไม่ต้องใส่ plugins: [ChartDataLabels] ท้ายสุดก็ได้
    });
  }

  // ============== กราฟใหม่ Stacked Bar (ล่างสุด) ==============
  renderCostStackedBar() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('costStackedBarChart') as HTMLCanvasElement;
    if (!canvas || !this.costData?.length) return;

    // หาหมวดหมู่หลัก (X-axis) ก็คือ SPEC (หรือ ItemNo) ตามที่เคยทำ
    // หากลุ่มแกน X: (Top 15 Items by selected ValueType)
    const itemTotalMap: { [spec: string]: number } = {};
    const groupSet = new Set<string>();

    const filteredData = this.getFilteredCostData();

    filteredData.forEach(item => {
      const spec = item.SPEC || 'ไม่ระบุ';
      const val = this.costStackedValueType === 'qty' ? (Number(item.QTY) || 0) : (Number(item.Total_Price_THB) || 0);

      itemTotalMap[spec] = (itemTotalMap[spec] || 0) + val;

      const groupVal = item[this.costStackedGroupBy] || 'ไม่ระบุ';
      groupSet.add(groupVal);
    });

    // เรียงหา Top N Item
    const topItems = Object.entries(itemTotalMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15) // เอาแค่ Top 15 ให้แสดงสวยๆ
      .map(d => d[0]);

    if (topItems.length === 0) return;

    // เตรียม Datasets ตามกลุ่ม (Division, Case, Process)
    const groups = Array.from(groupSet);

    // สร้างสีสุ่มแบบสวยๆ
    const colors = [
      'rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(255, 206, 86, 0.7)',
      'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
      'rgba(199, 199, 199, 0.7)', 'rgba(83, 102, 255, 0.7)', 'rgba(78, 205, 196, 0.7)', 'rgba(255, 107, 107, 0.7)'
    ];

    const datasets = groups.map((group, index) => {
      const data = topItems.map(spec => {
        return filteredData
          .filter(row => (row.SPEC || 'ไม่ระบุ') === spec && (row[this.costStackedGroupBy] || 'ไม่ระบุ') === group)
          .reduce((sum, row) => sum + (this.costStackedValueType === 'qty' ? (Number(row.QTY) || 0) : (Number(row.Total_Price_THB) || 0)), 0);
      });

      return {
        label: group,
        data: data,
        backgroundColor: colors[index % colors.length],
        borderWidth: 1,
        borderColor: '#fff'
      };
    });

    if (this.costStackedBarChart) this.costStackedBarChart.destroy();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.costStackedBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topItems,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                const val = context.parsed.y;
                if (this.costStackedValueType === 'price') {
                  label += (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' THB';
                } else {
                  label += (val || 0).toLocaleString() + ' ชิ้น';
                }
                return label;
              }
            }
          },
          datalabels: {
            display: false
          }
        },
        scales: {
          x: {
            stacked: true, // ทำให้กราฟซ้อนกัน
            ticks: {
              font: {
                family: "'Inter', 'Segoe UI', sans-serif"
              }
            }
          },
          y: {
            stacked: true, // ทำให้กราฟซ้อนกัน
            title: {
              display: true,
              text: this.costStackedValueType === 'qty' ? 'จำนวน (QTY)' : 'มูลค่ารวม (THB)',
              font: { weight: 'bold' }
            },
            ticks: {
              callback: function (value) {
                return value.toLocaleString();
              }
            }
          }
        }
      }
    });
  }

  // ============== กราฟอันเก่า (Overview) ==============
  renderStatusChart() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('dailySalesChart') as HTMLCanvasElement;
    if (!canvas || !this.data?.length) return;

    const overviewData = this.getFilteredOverviewData();
    const filteredData = this.selectedDivisions?.length
      ? overviewData.filter(item => this.selectedDivisions.includes(item.Division))
      : overviewData;

    const divisionStatusCounts: { [division: string]: { [status: string]: number } } = {};
    filteredData.forEach(item => {
      const division = item.Division;
      const status = item.Status;
      if (!divisionStatusCounts[division]) divisionStatusCounts[division] = {};
      divisionStatusCounts[division][status] = (divisionStatusCounts[division][status] || 0) + 1;
    });

    const labels = Array.from(new Set(filteredData.map(d => d.Status)));

    const divisionColors: { [division: string]: string } = {
      '7122': 'rgba(255, 99, 132, 0.6)',
      '71DZ': 'rgba(54, 162, 235, 0.6)'
    };

    const datasets = Object.keys(divisionStatusCounts).map(div => {
      const data = labels.map(status => divisionStatusCounts[div][status] || 0);
      return {
        label: div,
        data,
        backgroundColor: divisionColors[div] || 'rgba(200,200,200,0.6)',
        borderColor: '#fff',
        borderWidth: 1
      };
    });

    if (this.chart) this.chart.destroy();

    this.chart = new Chart(canvas, {
      type: 'pie',
      data: { labels, datasets },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    this.initZoomPan();
  }
  @ViewChild('chartWrapper') chartWrapper!: ElementRef<HTMLDivElement>;
  private scale = 1;
  private translateX = 0;
  private translateY = 0;
  private isDragging = false;
  private startX = 0;
  private startY = 0;

  // ------------------ จำกัด transform ให้อยู่ในกรอบ ------------------
  private applyTransformchart() {
    const wrapper = this.chartWrapper.nativeElement;
    const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;

    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;

    const scaledWidth = canvas.offsetWidth * this.scale;
    const scaledHeight = canvas.offsetHeight * this.scale;

    const maxTranslateX = Math.max((scaledWidth - wrapperWidth) / 2, 0);
    const maxTranslateY = Math.max((scaledHeight - wrapperHeight) / 2, 0);

    this.translateX = Math.max(Math.min(this.translateX, maxTranslateX), -maxTranslateX);
    this.translateY = Math.max(Math.min(this.translateY, maxTranslateY), -maxTranslateY);

    wrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  // ====== Zoom & Pan (สำหรับ Pie Chart) ======
  private initZoomPan() {
    const wrapper = this.chartWrapper.nativeElement;

    // Drag (Pan)
    wrapper.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      wrapper.style.cursor = 'grabbing';
    });

    wrapper.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.applyTransformchart(); // ✅ จำกัดกรอบ
    });

    wrapper.addEventListener('mouseup', () => {
      this.isDragging = false;
      wrapper.style.cursor = 'grab';
    });

    wrapper.addEventListener('mouseleave', () => {
      this.isDragging = false;
      wrapper.style.cursor = 'grab';
    });

    // Zoom (wheel)
    // wrapper.addEventListener('wheel', e => {
    //   e.preventDefault();
    //   const delta = e.deltaY < 0 ? 0.1 : -0.1;
    //   this.scale = Math.min(Math.max(this.scale + delta, 0.5), 3);
    //   this.applyTransformchart();
    // });
  }

  // ====== Toolbar ======
  zoomIn1() {
    this.scale = Math.min(this.scale + 0.2, 3);
    this.applyTransformchart();
  }

  zoomOut1() {
    this.scale = Math.max(this.scale - 0.2, 0.5);
    this.applyTransformchart();
  }

  resetChart() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.applyTransformchart();
  }

  // Export PNG
  exportStatusPNG() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = this.chartWrapper.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'status-chart.png';
    link.click();
  }
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


  selectedLevel: 'summary' | 'day' | 'month' | 'year' = 'summary';

  setLevel(level: 'summary' | 'day' | 'month' | 'year') {
    this.selectedLevel = level;
    this.renderStackedBarChart();
  }

  renderStackedBarChart() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('stackedSalesChart') as HTMLCanvasElement;
    if (!canvas || !this.data?.length) return;

    const overviewData = this.getFilteredOverviewData();

    // Already filtered by Global Division within getFilteredOverviewData()
    let filteredData = overviewData;

    if (this.selectedCaseall && this.selectedCaseall !== 'ALL') {
      filteredData = filteredData.filter(
        item => (item.CASE ?? '').toString().trim() === this.selectedCaseall.toString().trim()
      );
    }
    if (this.selectedprocess && this.selectedprocess !== 'ALL') {
      filteredData = filteredData.filter(
        item => (item.Process ?? '').toString().trim() === this.selectedprocess.toString().trim()
      );
    }

    // โหมด Summary: แสดงตาม PartNo รวมยอดเงินทั้งหมด
    const partNoTotalMap = filteredData.reduce((acc, item) => {
      const key = item.PartNo || item.SPEC || 'อื่นๆ';
      acc[key] = (acc[key] || 0) + (Number(item.Total_Price_THB) || 0);
      return acc;
    }, {} as { [key: string]: number });

    const topPartNos = (Object.entries(partNoTotalMap) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.topN1)
      .map(e => e[0]);

    const labels = topPartNos;

    // แบ่ง Dataset ตาม Case เพื่อความสวยงามและข้อมูลที่ครบถ้วน
    const cases = Array.from(new Set(filteredData.map(d => d.CASE || 'อื่นๆ')));
    const colors = [
      'rgba(54, 162, 235, 0.8)', 'rgba(255, 99, 132, 0.8)', 'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)', 'rgba(255, 159, 64, 0.8)',
      'rgba(199, 199, 199, 0.8)', 'rgba(0, 150, 136, 0.8)', 'rgba(233, 30, 99, 0.8)'
    ];

    const datasets: any[] = cases.map((c, i) => ({
      label: c,
      data: topPartNos.map(pn => {
        return filteredData
          .filter(item => (item.PartNo || item.SPEC || 'อื่นๆ') === pn && (item.CASE || 'อื่นๆ') === c)
          .reduce((sum, item) => sum + (Number(item.Total_Price_THB) || 0), 0);
      }),
      backgroundColor: colors[i % colors.length],
      borderColor: '#fff',
      borderWidth: 1
    }));

    if (this.stackedBarChart) this.stackedBarChart.destroy();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.stackedBarChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: {
              label: (context) => {
                const val = context.parsed.y;
                if (!val) return '';
                return `${context.dataset.label}: ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
              },
              footer: (tooltipItems) => {
                const context = tooltipItems[0];
                const val = context.parsed.y;
                if (!val) return '';

                const specName = labels[context.dataIndex];
                const caseName = context.dataset.label;
                const matchingItems = filteredData.filter(item => {
                  const itemSpec = item.PartNo || item.SPEC || 'อื่นๆ';
                  const itemCase = item.CASE || 'อื่นๆ';
                  return itemSpec === specName && itemCase === caseName && (Number(item.Total_Price_THB) || 0) > 0;
                });

                const totalQty = matchingItems.reduce((acc, curr) => acc + (Number(curr.QTY) || 0), 0);
                return `จำนวนที่เบิก: ${totalQty} ชิ้น`;
              }
            }
          },
          datalabels: {
            color: '#000',
            font: { weight: 'bold', size: 12 },
            anchor: 'end',
            align: 'top',
            formatter: (value, context) => {
              const total = context.chart.data.datasets.reduce((sum, ds) => {
                const v = (ds.data as number[])[context.dataIndex];
                return sum + (v || 0);
              }, 0);
              if (context.datasetIndex === context.chart.data.datasets.length - 1) {
                return total > 0 ? total.toLocaleString() : '';
              }
              return '';
            }
          }
        },
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { callback: (v) => v.toLocaleString() }
          }
        }
      }
    });
    this.initZoomPanStacked();
  }

  @ViewChild('stackedWrapper') stackedWrapper!: ElementRef<HTMLDivElement>;

  private scaleS = 1;
  private translateXS = 0;
  private translateYS = 0;
  private isDraggingS = false;
  private startXS = 0;
  private startYS = 0;

  // ------------------ จำกัด transform ให้อยู่ในกรอบ ------------------
  private applyTransformStacked() {
    const wrapper = this.stackedWrapper.nativeElement;
    const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;

    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;

    const scaledWidth = canvas.offsetWidth * this.scaleS;
    const scaledHeight = canvas.offsetHeight * this.scaleS;

    const maxTranslateX = Math.max((scaledWidth - wrapperWidth) / 2, 0);
    const maxTranslateY = Math.max((scaledHeight - wrapperHeight) / 2, 0);

    this.translateXS = Math.max(Math.min(this.translateXS, maxTranslateX), -maxTranslateX);
    this.translateYS = Math.max(Math.min(this.translateYS, maxTranslateY), -maxTranslateY);

    wrapper.style.transform = `translate(${this.translateXS}px, ${this.translateYS}px) scale(${this.scaleS})`;
  }

  // ====== Zoom & Pan Init ======
  private initZoomPanStacked() {
    const wrapper = this.stackedWrapper.nativeElement;

    wrapper.addEventListener('mousedown', e => {
      this.isDraggingS = true;
      this.startXS = e.clientX - this.translateXS;
      this.startYS = e.clientY - this.translateYS;
      wrapper.style.cursor = 'grabbing';
    });

    wrapper.addEventListener('mousemove', e => {
      if (!this.isDraggingS) return;
      this.translateXS = e.clientX - this.startXS;
      this.translateYS = e.clientY - this.startYS;
      this.applyTransformStacked();
    });

    wrapper.addEventListener('mouseup', () => {
      this.isDraggingS = false;
      wrapper.style.cursor = 'grab';
    });

    wrapper.addEventListener('mouseleave', () => {
      this.isDraggingS = false;
      wrapper.style.cursor = 'grab';
    });

    // wrapper.addEventListener('wheel', e => {
    //   e.preventDefault();
    //   const delta = e.deltaY < 0 ? 0.1 : -0.1;
    //   this.scaleS = Math.min(Math.max(this.scaleS + delta, 0.5), 3);
    //   this.applyTransformStacked();
    // });
  }

  // ====== Toolbar ======
  zoomInStacked() {
    this.scaleS = Math.min(this.scaleS + 0.2, 3);
    this.applyTransformStacked();
  }

  zoomOutStacked() {
    this.scaleS = Math.max(this.scaleS - 0.2, 0.5);
    this.applyTransformStacked();
  }

  resetStackedChart() {
    this.scaleS = 1;
    this.translateXS = 0;
    this.translateYS = 0;
    this.applyTransformStacked();
  }

  // Export PNG
  exportStackedPNG() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = this.stackedWrapper.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'stacked-sales-chart.png';
    link.click();
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////



  renderHorizontalBarChart() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = document.getElementById('horizontalBarChart') as HTMLCanvasElement;
    if (!canvas || !this.data?.length) return;

    const overviewData = this.getFilteredOverviewData().filter(item => {
      if (!item.DateComplete || !this.mostItemMonthYear) return true;
      const d = new Date(item.DateComplete);
      const [selYear, selMonth] = this.mostItemMonthYear.split('-').map(Number);
      return d.getFullYear() === selYear && (d.getMonth() + 1) === selMonth;
    });

    // ปรับโครงสร้างให้เก็บ PartNo ด้วย
    // { SPEC: { case1: { qty: number, partNos: string[] } } }
    const itemCaseMap: { [spec: string]: { [caseName: string]: { qty: number, partNos: string[] } } } = {};
    const itemDivisionMap: { [key: string]: string } = {};


    overviewData.forEach(item => {
      const SPEC = item.SPEC;
      const qty = Number(item.QTY) || 0;
      const division = item.Division || 'อื่นๆ';
      const caseName = item.CASE || 'ไม่ระบุ';
      const process = item.Process || 'ไม่ระบุ';

      itemDivisionMap[SPEC] = division;

      //  เพิ่ม filter process + ItemName
      const matchDivision = this.selectedDivision === 'ALL' || division === this.selectedDivision;
      const matchCase = this.selectedCase === 'ALL' || caseName === this.selectedCase;
      const matchProcess = this.selectedprocesshoz === 'ALL' || process === this.selectedprocesshoz;
      const itemName = item.ItemName || item.Description || '';
      const matchItemName = this.selectedItemNameHoz === 'ALL' || itemName === this.selectedItemNameHoz;

      if (matchDivision && matchCase && matchProcess && matchItemName) {
        if (!itemCaseMap[SPEC]) itemCaseMap[SPEC] = {};
        if (!itemCaseMap[SPEC][caseName]) itemCaseMap[SPEC][caseName] = { qty: 0, partNos: [] };

        itemCaseMap[SPEC][caseName].qty += qty;
        itemCaseMap[SPEC][caseName].partNos.push(item.PartNo);
      }
    });

    // หารายการ top N ตาม qty รวม
    const topItems = Object.entries(itemCaseMap)
      .map(([spec, CASE]) => [spec, Object.values(CASE).reduce((a, b) => a + b.qty, 0)] as [string, number]) //  ใช้ .qty
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.topN);

    const topItemNos = topItems.map(e => e[0]);

    // Build display labels: SPEC (ItemName)
    const topItemLabels = topItemNos.map(spec => {
      const name = this.specToItemNameMap[spec];
      return name ? `${spec} (${name})` : spec;
    });

    // list ของ case ที่มี
    const allCASE = Array.from(new Set(this.data.map(item => item.CASE || 'ไม่ระบุ')));

    // สีแยกตาม case
    function getPastelColors(count: number) {
      const colors: string[] = [];
      for (let i = 0; i < count; i++) {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 60;
        const lightness = 70;
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
      }
      return colors;
    }
    const caseColors = getPastelColors(allCASE.length);

    //  สร้าง dataset ตาม case
    const datasets = allCASE.map((caseName, idx) => ({
      label: caseName,
      data: topItemNos.map(spec => itemCaseMap[spec]?.[caseName]?.qty || 0),
      backgroundColor: caseColors[idx],
      borderColor: "#fff",
      borderWidth: 1
    }));

    if (this.horizontalBarChart) this.horizontalBarChart.destroy();
    const ctx = canvas.getContext('2d');

    this.horizontalBarChart = new Chart(ctx!, {
      type: 'bar',
      data: { labels: topItemLabels, datasets: datasets },
      options: {
        indexAxis: 'y',   // ✅ แกนสลับแนวนอน
        responsive: true,
        layout: {
          padding: {
            top: 10,
            right: 20,   // เว้นขอบขวา
            bottom: 5,  // เว้นขอบล่าง
            left: 20     // เว้นขอบซ้ายสำหรับ label Y
          }
        },

        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              generateLabels: (chart) => {
                return chart.data.datasets.map((ds, i) => {
                  const hidden = !chart.isDatasetVisible(i);
                  return {
                    text: ds.label as string,     // ✅ ชื่อ CASE
                    fillStyle: ds.backgroundColor as string,
                    strokeStyle: 'transparent',
                    hidden,
                    datasetIndex: i               // ต้องอ้าง datasetIndex ไม่ใช่ index
                  };
                });
              }
            },
            onClick: (e, legendItem, legend) => {
              const ci = legend.chart;
              ci.setDatasetVisibility(legendItem.datasetIndex!, !ci.isDatasetVisible(legendItem.datasetIndex!));
              ci.update();
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const value = context.raw as number;
                return `${context.dataset.label}: ${value} Piece`;
              },
              footer: function (contexts) {
                // contexts = array ของ point ที่ hover อยู่
                const ctx = contexts[0];
                const spec = ctx.label as string;
                const caseName = ctx.dataset.label as string;

                // ✅ ดึง PartNo
                const partNos = itemCaseMap[spec]?.[caseName]?.partNos || [];

                // ถ้าไม่มี PartNo ไม่ต้องโชว์
                return partNos.length ? `PartNo: ${partNos.join(", ")}` : '';
              }
            }
          },

          datalabels: {
            anchor: 'end',
            align: 'right',   // ✅ ชิดขวาแทน align: 'top'
            color: '#000',
            font: { weight: 'normal', size: 12 },
            formatter: (value, ctx) => {
              const chart = ctx.chart;
              const dataIndex = ctx.dataIndex;

              // หา dataset visible ตัวสุดท้าย
              const lastVisibleDatasetIndex = [...chart.data.datasets.keys()]
                .filter(i => chart.isDatasetVisible(i))
                .pop();

              if (ctx.datasetIndex === lastVisibleDatasetIndex) {
                const total = chart.data.datasets.reduce((sum, ds, i) => {
                  if (chart.isDatasetVisible(i)) {
                    const v = (ds.data as number[])[dataIndex];
                    return sum + (typeof v === 'number' ? v : 0);
                  }
                  return sum;
                }, 0);
                return total !== 0 ? total : '';
              }

              return '';
            }

          }
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            ticks: { padding: 5 } // เว้นระยะจากแกน
          },
          y: {
            stacked: true,
            ticks: { padding: 5 } // เว้นระยะจากแกน
          }
        },
      },
      plugins: [ChartDataLabels]
    });
    this.initZoomPanHorizontal(); // เรียกใช้ zoom/pan
  }


  resetHorizontalBarChart() {
    // รีเซ็ต zoom/pan
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    if (this.horizontalWrapper) {
      this.horizontalWrapper.nativeElement.style.transform = '';
    }

    // รีเรนเดอร์ chart ใหม่โดยไม่ต้อง destroy ถ้า chart มีอยู่
    if (this.horizontalBarChart) {
      this.horizontalBarChart.update();
    } else {
      this.renderHorizontalBarChart();
    }
  }

  @ViewChild('horizontalWrapper') horizontalWrapper!: ElementRef<HTMLDivElement>;

  private scaleH = 1;
  private translateXH = 0;
  private translateYH = 0;
  private isDraggingH = false;
  private startXH = 0;
  private startYH = 0;

  // ------------------ จำกัด transform ให้อยู่ในกรอบ ------------------
  private applyTransform() {
    const wrapper = this.horizontalWrapper.nativeElement;
    const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;

    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;

    // ใช้ offsetWidth/Height ของ canvas จริง
    const scaledWidth = canvas.offsetWidth * this.scaleH;
    const scaledHeight = canvas.offsetHeight * this.scaleH;

    // ขอบเขตลาก
    const maxTranslateX = Math.max((scaledWidth - wrapperWidth) / 2, 0);
    const maxTranslateY = Math.max((scaledHeight - wrapperHeight) / 2, 0);

    this.translateXH = Math.max(Math.min(this.translateXH, maxTranslateX), -maxTranslateX);
    this.translateYH = Math.max(Math.min(this.translateYH, maxTranslateY), -maxTranslateY);

    canvas.style.transform = `translate(${this.translateXH}px, ${this.translateYH}px) scale(${this.scaleH})`;
  }

  // ------------------ ปรับ zoom/pan ให้ลากอยู่ในกรอบ ------------------
  private initZoomPanHorizontal() {
    const canvas = this.horizontalWrapper.nativeElement.querySelector('canvas') as HTMLCanvasElement;

    canvas.addEventListener('mousedown', e => {
      this.isDraggingH = true;
      this.startXH = e.clientX - this.translateXH;
      this.startYH = e.clientY - this.translateYH;
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', e => {
      if (!this.isDraggingH) return;

      this.translateXH = e.clientX - this.startXH;
      this.translateYH = e.clientY - this.startYH;

      this.applyTransform(); // ✅ จำกัดกรอบ
    });

    canvas.addEventListener('mouseup', () => {
      this.isDraggingH = false;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('mouseleave', () => {
      this.isDraggingH = false;
      canvas.style.cursor = 'grab';
    });

    // wheel zoom ปิดแล้ว → ไม่ต้อง preventDefault เพื่อให้เลื่อนหน้าได้ปกติ
    // canvas.addEventListener('wheel', e => e.preventDefault());
  }

  // ------------------ ปุ่ม Zoom ------------------
  zoomIn() {
    this.scaleH = Math.min(this.scaleH + 0.2, 3);
    this.applyTransform();
  }

  zoomOut() {
    this.scaleH = Math.max(this.scaleH - 0.2, 0.5);
    this.applyTransform();
  }

  resetZoom() {
    this.scaleH = 1;
    this.translateXH = 0;
    this.translateYH = 0;
    this.applyTransform();
  }

  // ------------------ Export PNG ------------------
  exportHorizontalBarPNG() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.horizontalBarChart) return;
    const canvas = this.horizontalWrapper.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'horizontal-bar-chart.png';
    link.click();
  }


  //         formatter: (value, ctx) => {
  //   if (ctx.datasetIndex === ctx.chart.data.datasets.length - 1) {
  //     const chart = ctx.chart;
  //     const total = chart.data.datasets.reduce((sum, ds, i) => {
  //       if (chart.isDatasetVisible(i)) {
  //         const v = (ds.data as number[])[ctx.dataIndex];
  //         return sum + (typeof v === 'number' ? v : 0);
  //       }
  //       return sum;
  //     }, 0);
  //     return total !== 0 ? total : '';
  //   }
  //   return '';
  // }

  fileName = 'Report.xlsx';

  exportexcel() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.dataFromDB || this.dataFromDB.length === 0) {
      alert("ไม่มีข้อมูลจาก Database");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // --- ใส่ header ---
    const headers = Object.keys(this.dataFromDB[0]);
    worksheet.addRow(headers);

    // --- ใส่ข้อมูล ---
    this.dataFromDB.forEach(row => {
      const rowData = headers.map(h => {
        const val = row[h];
        // Check if header implies a date or value looks like a date string
        // Common date fields: DateComplete, DateTime_Record, DueDate
        if ((h.includes('Date') || h.includes('Time')) && val) {
          // Try parsing
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            // Format as mm/dd/yyyy
            const day = d.getDate().toString().padStart(2, '0');
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const year = d.getFullYear();
            return `${month}/${day}/${year}`;
          }
        }
        return val;
      });
      worksheet.addRow(rowData);
    });

    // --- วาดกราฟจาก canvas ---
    const chartCanvas = document.getElementById('stackedSalesChart') as HTMLCanvasElement
      || document.getElementById('horizontalBarChart') as HTMLCanvasElement;

    if (!chartCanvas) {
      console.warn("ไม่พบ chart canvas");
      workbook.xlsx.writeBuffer().then((buffer: ArrayBuffer) => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, this.fileName);
      });
      return;
    }

    html2canvas(chartCanvas).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const base64Data = imgData.split(',')[1];

      // ✨ Browser-safe: ใช้ Uint8Array แล้ว cast เป็น any
      const imgBuffer = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0))) as any;

      const imageId = workbook.addImage({ buffer: imgBuffer, extension: 'png' });

      // วางรูปด้านล่างตาราง
      const lastRow = worksheet.lastRow?.number || this.dataFromDB.length + 2;
      worksheet.addImage(imageId, {
        tl: { col: 0, row: lastRow + 2 },
        ext: { width: 700, height: 400 }
      });

      workbook.xlsx.writeBuffer().then((buffer: ArrayBuffer) => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, this.fileName);
      });
    });
  }
}
