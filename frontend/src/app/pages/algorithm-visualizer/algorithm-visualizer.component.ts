import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ForecastService } from '../../core/services/forecast.service';
import Swal from 'sweetalert2';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-algorithm-visualizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './algorithm-visualizer.component.html',
  styleUrl: './algorithm-visualizer.component.scss'
})
export class AlgorithmVisualizerComponent implements OnInit, AfterViewInit {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  chart: any;
  searchItemNo: string = 'P111006A';
  summary: any = null;
  records: any[] = [];
  isLoading = false;

  constructor(private forecastService: ForecastService) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.fetchData();
  }

  fetchData() {
    if (!this.searchItemNo) return;
    this.isLoading = true;
    
    Swal.fire({ title: 'กำลังวิเคราะห์ข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    this.forecastService.getToolingUsageAudit(this.searchItemNo).subscribe({
      next: (res: any) => {
        Swal.close();
        this.isLoading = false;
        if (!res || !res.records || res.records.length === 0) {
          Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลประวัติการเบิกสำหรับ Item นี้', 'warning');
          return;
        }
        this.summary = res.summary;
        this.records = res.records;
        this.renderChart();
      },
      error: (err) => {
        Swal.close();
        this.isLoading = false;
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ' + err.message, 'error');
      }
    });
  }

  renderChart() {
    if (this.chart) {
      this.chart.destroy();
    }
    const ctx = this.chartCanvas.nativeElement.getContext('2d') as CanvasRenderingContext2D;

    const scatterDataKept: any[] = [];
    const scatterDataIQR: any[] = [];
    const scatterDataDBSCAN: any[] = [];
    
    let maxIdx = 0;
    
    // We assume all records belong to the same part for the bounds lines
    // Get the bounds from the first record (since they share bounds if it's one part)
    // Wait, the backend doesn't output bounds in the record. Let's find min/max usage to draw lines.
    // Actually, we can approximate the bounds if needed, or just let users see the Master/Avg lines.
    // I didn't send upperBound/lowerBound in the summary, so I'll draw lines for Master and AI Avg.
    
    this.records.forEach((r, idx) => {
      const x = idx + 1;
      maxIdx = Math.max(maxIdx, x);
      const point = { x: x, y: r.total_usage, data: r };
      
      if (!r.isExcluded) {
        scatterDataKept.push(point);
      } else if (r.exclusionReason.includes('IQR') || r.exclusionReason.includes('Bound') || r.exclusionReason.includes('ต่ำเกินไป') || r.exclusionReason.includes('สูงผิดปกติ')) {
        scatterDataIQR.push(point);
      } else {
        scatterDataDBSCAN.push(point);
      }
    });

    const masterLineData = [
      { x: 0, y: this.summary.masterUsagePcs },
      { x: maxIdx + 1, y: this.summary.masterUsagePcs }
    ];

    const aiLineData = [
      { x: 0, y: this.summary.finalAvgUsage },
      { x: maxIdx + 1, y: this.summary.finalAvgUsage }
    ];

    this.chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            type: 'line',
            label: 'Master Usage (มาตรฐาน)',
            data: masterLineData,
            borderColor: '#ffc107',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            order: 1
          },
          {
            type: 'line',
            label: 'Avg Usage (AI)',
            data: aiLineData,
            borderColor: '#0d6efd',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 2
          },
          {
            type: 'scatter',
            label: 'กลุ่มปกติ (Pass)',
            data: scatterDataKept,
            backgroundColor: 'rgba(40, 167, 69, 0.8)',
            borderColor: '#1e7e34',
            pointRadius: 6,
            pointHoverRadius: 9,
            order: 3
          },
          {
            type: 'scatter',
            label: 'ตัดทิ้ง (IQR Outlier)',
            data: scatterDataIQR,
            backgroundColor: 'rgba(220, 53, 69, 0.8)',
            borderColor: '#bd2130',
            pointStyle: 'crossRot',
            pointRadius: 8,
            pointHoverRadius: 11,
            borderWidth: 2,
            order: 4
          },
          {
            type: 'scatter',
            label: 'ตัดทิ้ง (DBSCAN หลุดกลุ่ม)',
            data: scatterDataDBSCAN,
            backgroundColor: 'rgba(253, 126, 20, 0.8)',
            borderColor: '#fd7e14',
            pointStyle: 'rect',
            pointRadius: 7,
            pointHoverRadius: 10,
            order: 5
          }
        ]
      },
      options: {
        // @ts-ignore
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Kanit', size: 14 },
              padding: 20,
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#333',
            bodyColor: '#555',
            borderColor: '#ddd',
            borderWidth: 1,
            padding: 12,
            titleFont: { size: 14, family: 'Kanit' },
            bodyFont: { size: 13, family: 'Kanit' },
            callbacks: {
              title: (context: any) => {
                if (context[0].dataset.type === 'line') return context[0].dataset.label;
                return `ลำดับบิล: ${context[0].raw.x} (${context[0].raw.data.part_name})`;
              },
              label: (context: any) => {
                if (context.dataset.type === 'line') return `ยอด: ${context.raw.y.toLocaleString()}`;
                const r = context.raw.data;
                const status = r.isExcluded ? `❌ ${r.exclusionReason}` : `✅ นำมาคำนวณ`;
                return [
                  `Usage: ${r.total_usage.toLocaleString()}`,
                  `Status: ${r.tooling_status}`,
                  `ผลลัพธ์: ${status}`
                ];
              }
            }
          }
        },
        scales: {
          x: { 
            title: { display: true, text: 'ลำดับบิล', font: { family: 'Kanit' } },
            ticks: { stepSize: 1 }
          },
          y: { 
            title: { display: true, text: 'Total Usage', font: { family: 'Kanit' } },
            beginAtZero: true
          }
        },
        layout: { padding: 10 }
      }
    });
  }
}
