import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import Chart from 'chart.js/auto';
import { DashboardService } from '../../../services/dashboard/dashboard.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-home.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardHome implements AfterViewInit, OnDestroy {
  private orderChart!: Chart;
  private statusChart!: Chart<'doughnut', number[], string>;

  private readonly STATUS_ORDER = [
    'PENDING',
    'CONFIRMED',
    'SHIPPING',
    'COMPLETED',
    'CANCELED',
  ] as const;

  private readonly STATUS_LABELS: Record<string, string> = {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    SHIPPING: 'Đang giao',
    COMPLETED: 'Hoàn tất',
    CANCELED: 'Đã hủy',
  };

  private readonly STATUS_COLORS: Record<string, string> = {
    PENDING: '#868685',
    CONFIRMED: '#38c8ff',
    SHIPPING: '#ffc091',
    COMPLETED: '#054d28',
    CANCELED: '#d03238',
  };

  @ViewChild('orderChartCanvas') orderChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChartCanvas') statusChartCanvas!: ElementRef<HTMLCanvasElement>;

  deliveredCount = 0;
  returnedCount = 0;
  totalOrders = 0;
  estimatedRevenue = 0;

  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();
  viewAllYear = false;

  monthOptions = Array.from({ length: 12 }, (_, i) => ({
    label: `Tháng ${i + 1}`,
    value: i + 1,
  }));

  yearOptions = (() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  })();

  summaryCards = [
    {
      label: 'Đã giao thành công',
      value: 0,
      icon: 'mdi:truck-check-outline',
      textClass: 'text-success',
    },
    {
      label: 'Đã hoàn / bị hủy',
      value: 0,
      icon: 'mdi:package-variant-remove',
      textClass: 'text-danger',
    },
    {
      label: 'Tổng đơn trong kỳ',
      value: 0,
      icon: 'mdi:package-variant-closed',
      textClass: 'text-primary',
    },
    {
      label: 'Doanh thu ước tính',
      value: '0đ',
      icon: 'mdi:cash-multiple',
      textClass: 'text-warning',
    },
  ];

  constructor(private dashboardService: DashboardService) {}

  ngAfterViewInit(): void {
    this.fetchStatistics();
  }

  onMonthOrYearChange() {
    this.fetchStatistics();
  }

  private fetchStatistics(): void {
    const month = this.viewAllYear ? undefined : this.selectedMonth;
    const year = this.selectedYear;

    this.dashboardService.getStatistics(month, year).subscribe((res: any) => {
      const data = res?.data || {};

      this.deliveredCount = data.statusCounts?.COMPLETED ?? 0;
      this.returnedCount = data.statusCounts?.CANCELED ?? 0;
      this.totalOrders = data.totalOrders ?? 0;
      this.estimatedRevenue = data.estimatedRevenue ?? 0;

      this.summaryCards[0].value = this.deliveredCount;
      this.summaryCards[1].value = this.returnedCount;
      this.summaryCards[2].value = this.totalOrders;
      this.summaryCards[3].value = `${this.estimatedRevenue.toLocaleString()}đ`;

      this.renderCharts(data);
    });
  }

  private renderCharts(data: any): void {
    const dayOrder = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const labels = dayOrder.filter((k) => data.ordersByDay?.[k]);

    const statusKeys: string[] = Object.keys(data.statusCounts || {});
    const statuses = statusKeys.length ? statusKeys : this.STATUS_ORDER;

    const datasets = statuses.map((st) => ({
      label: this.STATUS_LABELS[st],
      data: labels.map((d) => data.ordersByDay?.[d]?.[st] ?? 0),
      tension: 0.34,
      fill: false,
      borderColor: this.STATUS_COLORS[st],
      backgroundColor: this.STATUS_COLORS[st],
      pointRadius: 3,
      pointHoverRadius: 5,
    }));

    if (this.orderChart) this.orderChart.destroy();
    this.orderChart = new Chart(this.orderChartCanvas.nativeElement, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` },
          },
        },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: 'rgba(14,15,12,0.06)' } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(14,15,12,0.08)' } },
        },
      },
    });

    const statusCounts = data.statusDistribution || data.statusCounts || {};
    const visibleStatuses = this.STATUS_ORDER.filter((st) => statusCounts[st] !== undefined);
    const doughnutLabelsVN = visibleStatuses.map((st) => this.STATUS_LABELS[st]);
    const doughnutValues = visibleStatuses.map((st) => Number(statusCounts[st] || 0));
    const doughnutColors = visibleStatuses.map((st) => this.STATUS_COLORS[st]);

    if (this.statusChart) this.statusChart.destroy();

    if (doughnutLabelsVN.length === 0 || doughnutValues.every((v) => v === 0)) {
      const ctx = this.statusChartCanvas.nativeElement.getContext('2d');
      if (ctx) {
        ctx.clearRect(
          0,
          0,
          this.statusChartCanvas.nativeElement.width,
          this.statusChartCanvas.nativeElement.height,
        );
        ctx.font = '16px Inter';
        ctx.fillStyle = '#868685';
        ctx.textAlign = 'center';
        ctx.fillText('Không có dữ liệu', this.statusChartCanvas.nativeElement.width / 2, 80);
      }
      return;
    }

    this.statusChart = new Chart<'doughnut', number[], string>(
      this.statusChartCanvas.nativeElement,
      {
        type: 'doughnut',
        data: {
          labels: doughnutLabelsVN,
          datasets: [
            {
              data: doughnutValues,
              backgroundColor: doughnutColors,
              borderColor: '#ffffff',
              borderWidth: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } },
          },
        },
      },
    );
  }

  ngOnDestroy(): void {
    this.orderChart?.destroy();
    this.statusChart?.destroy();
  }
}
