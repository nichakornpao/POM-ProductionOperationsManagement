
import { Component, OnInit, AfterViewInit } from '@angular/core';
import { NgSelectModule } from '@ng-select/ng-select';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AnalyzeSmartRackService } from '../../../core/services/analyzeSmartRack.service';
import { SidebarPurchaseComponent } from '../../../components/sidebar/sidebarPurchase.component';
import { Chart, registerables,ChartDataset, ChartConfiguration  } from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';


Chart.register(...registerables );

@Component({
  selector: 'app-analyzeSmartrack',
  standalone: true,
  imports: [
    NgSelectModule,
        FormsModule,
        RouterOutlet, 
        CommonModule,
        SidebarPurchaseComponent,
  ],
  templateUrl: './analyzeSmartrack.component.html',
  styleUrl: './analyzeSmartrack.component.scss'
})
export class AnalyzeSmartRackComponent {


    public data: any[] = [];
    public loading: boolean = false;
    public error: string = '';
    
    // ตัวเลือก dropdown
    divisions = [
    { name: '7122' },
    { name: '71DZ' }
  ];
  
  
  
  selectedDivisions: string[] = []; // เก็บ division ที่เลือก
  chart: Chart | null = null;
  
  partNos: string[] = [];          // เก็บ list PartNo
  selectedPartNo: string = '';     // ค่า PartNo ที่เลือก (ค่าเดียว)
    
    
  itemNos: string[] = [];
  selectedItemNos: string[] = []; // เก็บ ItemNo ที่เลือก
  uniqueItemNos: string[] = [];   // เก็บ ItemNo ทั้งหมด
  chartInstance: any;
  
  topN1: number = 10;  
  topN: number = 10; // ค่าเริ่มต้น
  Divisions: string[] = [];
  Cases: string[] = [];
  selectedDivision: string = 'ทั้งหมด';
  selectedDivisionStacked: string = 'ทั้งหมด';
  selectDatestart:string | null=null;
  selectDateend:string | null=null;
  selectedCase: string = 'ALL';
  
    public pieChart: Chart | null = null;
    public horizontalBarChart: Chart | null = null;
    public stackedBarChart: Chart | null = null; // ถ้ามี stacked bar
    constructor(private analyzeSmartRackPurchase: AnalyzeSmartRackService
    ) {}
     
  
  
    ngOnInit() {
    this.uniqueItemNos = Array.from(new Set(this.data.map(d => d.ItemNo)));
    this.renderHorizontalBarChart();
      this.fetchAnalyzeData();
       
    }
  
    onItemNoChange() {
    this.renderHorizontalBarChart();
  }
    ngAfterViewInit(): void {
      // DOM พร้อมแล้ว เรียก API
      this.fetchAnalyzeData();
    }
  
  //   fetchAnalyzeData() {
  //   this.loading = true;
  //   this.analyzeSmartRackPurchase.getdatasmartrack().subscribe({
  //     next: (response: any[]) => {
  //       this.data = response;

  //       //  เช็คข้อมูลจาก API
  //       console.log('API Response:', this.data);
  //       // สร้าง dropdown divisions จาก data
  //       const divisionSet = new Set<string>();
  //       this.data.forEach(item => divisionSet.add(item.Division || 'อื่นๆ'));
  //       this.Divisions = Array.from(divisionSet);
  
  //       // ค่า default dropdown
  //       if (!this.selectedDivision) this.selectedDivision = 'ทั้งหมด';
  
  //       this.loading = false;
  //       this.renderStatusChart(); // วาด Pie chart
  //       this.renderStackedBarChart(); // Stacked Bar Chart
  //       this.renderHorizontalBarChart(); // Horizontal Bar Chart
  //     },
  //     error: (err) => {
  //       console.error(err);
  //       this.error = 'ไม่สามารถโหลดข้อมูลได้';
  //       this.loading = false;
  //     }
  //   });
  // }
  
  fetchAnalyzeData() {
  this.loading = true;
  this.analyzeSmartRackPurchase.getdatasmartrack().subscribe({
    next: (response: any) => {
     

      // ตรวจสอบและ assign เป็น array
      this.data = Array.isArray(response) ? response : (response.data || []);

      // console.log('this.data :', this.data);

      const divisionSet = new Set<string>();
      this.data.forEach(item => divisionSet.add(item.Division || 'อื่นๆ'));
      this.Divisions = Array.from(divisionSet);

      const caseSet = new Set<string>();
      this.data.forEach(item => caseSet.add(item.CASE || 'อื่นๆ'));
      this.Cases = Array.from(caseSet);

      if (!this.selectedDivision) this.selectedDivision = 'ทั้งหมด';

      this.loading = false;
      this.renderStatusChart();
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

  
  
  renderStatusChart() {
    
    
    const canvas = document.getElementById('dailySalesChart') as HTMLCanvasElement;
    if (!canvas || !this.data.length) return;
  
    // กรองตาม selectedDivisions ถ้ามี
    const filteredData = this.selectedDivisions?.length
      ? this.data.filter(item => this.selectedDivisions.includes(item.Division))
      : this.data;
     
  
    // สร้าง map ของ Status ตาม Division
    const divisionStatusCounts: { [division: string]: { [status: string]: number } } = {};
  
    filteredData.forEach(item => {
      const division = item.Division;
      const status = item.ToolingStatus;
  
      if (!divisionStatusCounts[division]) {
        divisionStatusCounts[division] = {};
      }
      divisionStatusCounts[division][status] = (divisionStatusCounts[division][status] || 0) + 1;
    });
  
    // รวม Status ทั้งหมดเป็น labels เดียว
    const labels = Array.from(new Set(filteredData.map(d => d.ToolingStatus)));
  
    // colors สำหรับแต่ละ division
    const divisionColors: { [division: string]: string } = {
      '7122': 'rgba(255, 99, 132, 0.6)',  // สีแดง
      '71DZ': 'rgba(54, 162, 235, 0.6)'   // สีฟ้า
    };
  
    // สร้าง datasets แยกตาม Division
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
      type: 'pie',  // หรือ 'doughnut'
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  
  
  selectedLevel: 'day' | 'month' | 'year' = 'day';
  
  setLevel(level: 'day' | 'month' | 'year') {
    this.selectedLevel = level;
    this.renderStackedBarChart();
  }
  
  renderStackedBarChart() {
  // console.log("API g", this.data);

  const canvas = document.getElementById('stackedSalesChart') as HTMLCanvasElement;
  if (!canvas || !this.data?.length) return;
  // console.log('canvas',canvas)

  const specs = Array.from(new Set(this.data.map(d => d.SPEC || 'อื่นๆ')));

  // กรองตาม Division
  let filteredData = this.selectedDivisionStacked === 'ทั้งหมด'
    ? this.data
    : this.data.filter(d => d.Division === this.selectedDivisionStacked);

  // กรองตามช่วงวันที่
  if (this.selectDatestart) {
    const startDate = new Date(this.selectDatestart);
    filteredData = filteredData.filter(item => new Date(item.WrokingDay) >= startDate);
  }
  if (this.selectDateend) {
    const endDate = new Date(this.selectDateend);
    filteredData = filteredData.filter(item => new Date(item.WrokingDay) <= endDate);
  }

  // Group ข้อมูลตาม level
  const groupedData = filteredData.reduce((acc, item) => {
    const dateObj = new Date(item.WrokingDay);
    let key = '';
    if (this.selectedLevel === 'day') key = dateObj.toISOString().split('T')[0];
    else if (this.selectedLevel === 'month') key = `${dateObj.getFullYear()}-${(dateObj.getMonth()+1).toString().padStart(2,'0')}`;
    else key = `${dateObj.getFullYear()}`;

    const qty = Number(item.Total) || 0;
    acc[key] = (acc[key] || 0) + qty;
    return acc;
  }, {} as { [key: string]: number });

  const topKeys = (Object.entries(groupedData) as [string, number][])
    .sort((a,b) => b[1]-a[1])
    .slice(0,this.topN1)
    .map(e => e[0]);

  const dates = topKeys.map(k => {
    if (this.selectedLevel==='day') return { key:k, obj: new Date(k) };
    if (this.selectedLevel==='month') return { key:k, obj: new Date(k+'-01') };
    return { key:k, obj: new Date(k+'-01-01') };
  }).sort((a,b)=>a.obj.getTime()-b.obj.getTime());

  const labels = dates.map(d=>{
    const dateObj = d.obj;
    if(this.selectedLevel==='day') return `${dateObj.getDate().toString().padStart(2,'0')}/${(dateObj.getMonth()+1).toString().padStart(2,'0')}/${dateObj.getFullYear()}`;
    if(this.selectedLevel==='month') return `${(dateObj.getMonth()+1).toString().padStart(2,'0')}/${dateObj.getFullYear()}`;
    return `${dateObj.getFullYear()}`;
  });

  const datasets = specs.map(spec => ({
    label: spec,
    data: dates.map(d => filteredData
      .filter(item => (item.SPEC || 'อื่นๆ') === spec)
      .filter(item => {
        const dateObj = new Date(item.WrokingDay);
        if(this.selectedLevel==='day') return dateObj.toISOString().split('T')[0] === d.key;
        if(this.selectedLevel==='month') return `${dateObj.getFullYear()}-${(dateObj.getMonth()+1).toString().padStart(2,'0')}` === d.key;
        return `${dateObj.getFullYear()}` === d.key;
      })
      .reduce((sum, item) => sum + (Number(item.Total) || 0), 0)  // ❌ เอา UnitPrice_Bath ออก
    ),
    backgroundColor: `hsl(${Math.floor(Math.random()*360)},60%,70%)`,
    borderColor:'#fff',
    borderWidth:1
  }));

  if (this.stackedBarChart) this.stackedBarChart.destroy();
  const ctx = canvas.getContext('2d');
  if(!ctx) return;

  this.stackedBarChart = new Chart(ctx!, {
    type:'bar',
    data:{labels, datasets},
    options:{
      indexAxis:'x',
      responsive:true,
      plugins:{
        legend:{
          position:'right',
          align:'start',
          labels:{
            boxWidth:20,
            boxHeight:20,
            padding:15,
            usePointStyle:true,
            pointStyle:'rectRounded',
            font:{size:10}
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const spec = context.dataset.label;
              const dateKey = dates[context.dataIndex].key;
              const matchingItems = filteredData.filter(item => {
                const itemSpec = item.SPEC || 'อื่นๆ';
                const dateObj = new Date(item.WrokingDay);
                let itemKey = '';
                if (this.selectedLevel === 'day') itemKey = dateObj.toISOString().split('T')[0];
                else if (this.selectedLevel === 'month') itemKey = `${dateObj.getFullYear()}-${(dateObj.getMonth()+1).toString().padStart(2,'0')}`;
                else itemKey = `${dateObj.getFullYear()}`;
                return itemSpec === spec && itemKey === dateKey;
              });
              const total = matchingItems.reduce((sum, i) => sum + (Number(i.Total) || 0),0);
              return `${spec}: ${total.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})} Baht`;
            },
            footer: (tooltipItems) => {
              if (!tooltipItems.length) return '';
              const context = tooltipItems[0];
              const spec = context.dataset.label;
              const dateKey = dates[context.dataIndex].key;
              const matchingItems = filteredData.filter(item => {
                const itemSpec = item.SPEC || 'อื่นๆ';
                const dateObj = new Date(item.WrokingDay);
                let itemKey = '';
                if (this.selectedLevel === 'day') itemKey = dateObj.toISOString().split('T')[0];
                else if (this.selectedLevel === 'month') itemKey = `${dateObj.getFullYear()}-${(dateObj.getMonth()+1).toString().padStart(2,'0')}`;
                else itemKey = `${dateObj.getFullYear()}`;
                return itemSpec === spec && itemKey === dateKey;
              });
              const partNos = matchingItems.map(i => i.PartNo).join(', ');
              return partNos ? `PartNo: ${partNos} `: '';
            }
          }
        },
        datalabels:{
          anchor:'end',
          align:'top',
          color:'#000000ff',
          font:{size:12},
          formatter: (value, ctx) => {
            if (ctx.datasetIndex === ctx.chart.data.datasets.length - 1) {
              const total = ctx.chart.data.datasets.reduce((sum, ds) => {
                const v = (ds.data as number[])[ctx.dataIndex];
                return sum + (typeof v === 'number' ? v : 0);
              }, 0);
              return total !== 0 ? total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
            }
            return '';
          }
        }
      },
      scales: { x:{stacked:true}, y:{stacked:true, beginAtZero:true} }
    },
    plugins:[ChartDataLabels]
  });
}
   
  // renderStackedBarChart() {
  
  
  
  ///////////////////////////////////////////////////////////////////////////////////////////////////////
  
  
  
  renderHorizontalBarChart() {
    const canvas = document.getElementById('horizontalBarChart') as HTMLCanvasElement;
    if (!canvas || !this.data?.length) return;
  
    // เก็บโครงสร้างข้อมูล: { SPEC: { case1: qty, case2: qty } }
    const itemCaseMap: { [spec: string]: { [caseName: string]: number } } = {};
    const itemDivisionMap: { [key: string]: string } = {};
  
    this.data.forEach(item => {
      const SPEC = item.SPEC;
      const qty = Number(item.Total) || 0;
      const division = item.Division || 'อื่นๆ';
      const caseName = item.ToolingStatus || 'ไม่ระบุ';
  
      itemDivisionMap[SPEC] = division;
  
      if (this.selectedDivision === 'ทั้งหมด' || division === this.selectedDivision) {
        if (!itemCaseMap[SPEC]) itemCaseMap[SPEC] = {};
        itemCaseMap[SPEC][caseName] = (itemCaseMap[SPEC][caseName] || 0) + qty;
      }
    });
  
    // หารายการ top N ตาม qty รวม
    const topItems = Object.entries(itemCaseMap)
      .map(([spec, ToolingStatus]) => [spec, Object.values(ToolingStatus).reduce((a, b) => a + b, 0)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.topN);
  
    const topItemNos = topItems.map(e => e[0]);
  
    // list ของ case ที่มี
    const allCASE = Array.from(new Set(this.data.map(item => item.ToolingStatus || 'ไม่ระบุ')));
  
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
  
    // ✅ สร้าง dataset ตาม case
    const datasets = allCASE.map((caseName, idx) => ({
      label: caseName,
      data: topItemNos.map(spec => itemCaseMap[spec]?.[caseName] || 0),
      backgroundColor: caseColors[idx],
      borderColor: "#fff",
      borderWidth: 1
    }));
  
    if (this.horizontalBarChart) this.horizontalBarChart.destroy();
    const ctx = canvas.getContext('2d');
  
    this.horizontalBarChart = new Chart(ctx!, {
    type: 'bar',
    data: { labels:topItemNos, datasets:datasets },
    options: {
      indexAxis: 'y',   // ✅ แกนสลับแนวนอน
      responsive: true,
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
  
        }
      },
      scales: {
        x: { stacked: true, beginAtZero: true },
        y: { stacked: true }
      }
    },
    plugins: [ChartDataLabels]
  });
  }
  
}
