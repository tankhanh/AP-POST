import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import { DashboardService } from '../../services/dashboard/dashboard.service';

@Component({
  selector: 'app-dashboard-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-admin.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardAdmin implements AfterViewInit, OnDestroy {
  @ViewChild('revenueOrderChart') revenueOrderChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart') statusChartEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topEmployeesChart') topEmployeesChart!: ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];

  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();
  viewAllYear = false;

  monthOptions = Array.from({ length: 12 }, (_, i) => ({
    label: `Tháng ${i + 1}`,
    value: i + 1,
  }));

  yearOptions = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  summaryCards: any[] = [];

  private STATUS_LABELS: Record<string, string> = {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    SHIPPING: 'Đang giao',
    COMPLETED: 'Hoàn tất',
    CANCELED: 'Đã hủy',
  };

  private STATUS_COLORS: Record<string, string> = {
    PENDING: '#868685',
    CONFIRMED: '#38c8ff',
    SHIPPING: '#ffc091',
    COMPLETED: '#054d28',
    CANCELED: '#d03238',
  };

  constructor(private dashboardService: DashboardService) {}

  ngAfterViewInit(): void {
    this.loadData();
  }

  onFilterChange() {
    this.loadData();
  }

  private loadData() {
    const month = this.viewAllYear ? undefined : this.selectedMonth;
    const year = this.selectedYear;

    this.dashboardService.getSystemStatistics(month, year).subscribe({
      next: (res) => {
        const data = (res as any).data || res;
        if (data) {
          this.updateSummaryCards(data.summary);
          this.renderCharts(data);
        }
      },
      error: (err) => {
        console.error('Load dashboard failed', err);
      },
    });
  }

  private updateSummaryCards(summary: any) {
    if (!summary) return;
    this.summaryCards = [
      {
        label: 'Tổng đơn hàng',
        value: summary.totalOrders?.toLocaleString() || '0',
        icon: 'mdi:package-variant-closed',
        textClass: 'text-primary',
      },
      {
        label: 'Đã giao thành công',
        value: summary.deliveredOrders?.toLocaleString() || '0',
        icon: 'mdi:truck-check-outline',
        textClass: 'text-success',
      },
      {
        label: 'Đã hủy / hoàn',
        value: summary.canceledOrders?.toLocaleString() || '0',
        icon: 'mdi:package-variant-remove',
        textClass: 'text-danger',
      },
      {
        label: 'Đơn hôm nay',
        value: summary.todayOrders || 0,
        icon: 'mdi:lightning-bolt-outline',
        textClass: 'text-warning',
      },
      {
        label: 'Doanh thu hôm nay',
        value: `${(summary.todayRevenue || 0).toLocaleString()}đ`,
        icon: 'mdi:cash-multiple',
        textClass: 'text-success',
      },
      {
        label: 'Nhân viên hoạt động',
        value: summary.activeEmployees || 0,
        sub: `/ ${summary.totalEmployees || 0} tổng`,
        icon: 'mdi:account-group-outline',
        textClass: 'text-info',
      },
      {
        label: 'Tỷ lệ COD',
        value: `${summary.codRate || 0}%`,
        icon: 'mdi:cash-fast',
        textClass: 'text-purple',
      },
      {
        label: 'Tỷ lệ giao thành công',
        value: `${summary.successRate || 0}%`,
        icon: 'mdi:check-decagram-outline',
        textClass: 'text-success',
      },
      {
        label: 'Đơn kẹt > 48h',
        value: summary.stuckOrders48h || 0,
        icon: 'mdi:alert-outline',
        textClass: 'text-danger',
      },
      {
        label: 'Bảng giá đang áp dụng',
        value: summary.activePricingTables || 0,
        icon: 'mdi:table-cog',
        textClass: 'text-secondary',
      },
    ];
  }

  private renderCharts(data: any) {
    this.destroyAllCharts();

    if (!data.charts) return;

    const days = data.charts.dailyLabels || [];
    const labels = days.map((d: number) => `Ngày ${d}`);

    this.charts.push(
      new Chart(this.revenueOrderChart.nativeElement, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Số đơn',
              data: data.charts.dailyOrders || [],
              borderColor: '#0e0f0c',
              backgroundColor: 'rgba(14, 15, 12, 0.08)',
              yAxisID: 'y',
              tension: 0.34,
              fill: true,
            },
            {
              label: 'Doanh thu (đ)',
              data: data.charts.dailyRevenue || [],
              borderColor: '#9fe870',
              backgroundColor: 'rgba(159, 232, 112, 0.16)',
              yAxisID: 'y1',
              tension: 0.34,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } },
          scales: {
            x: { grid: { color: 'rgba(14,15,12,0.06)' } },
            y: {
              beginAtZero: true,
              position: 'left',
              title: { display: true, text: 'Số đơn' },
              grid: { color: 'rgba(14,15,12,0.08)' },
            },
            y1: {
              beginAtZero: true,
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Doanh thu' },
            },
          },
        },
      }),
    );

    const statusData = data.charts.statusDistribution || {};
    const statusLabels = Object.keys(statusData).filter((k) => statusData[k] > 0);
    const statusValues = statusLabels.map((k) => statusData[k]);
    const statusColors = statusLabels.map((k) => this.STATUS_COLORS[k] || '#868685');

    this.charts.push(
      new Chart(this.statusChartEl.nativeElement, {
        type: 'doughnut',
        data: {
          labels: statusLabels.map((k) => this.STATUS_LABELS[k] || k),
          datasets: [
            {
              data: statusValues,
              backgroundColor: statusColors,
              borderColor: '#ffffff',
              borderWidth: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
        },
      }),
    );

    const topEmp = data.charts?.topEmployees || [];

    if (topEmp.length === 0) {
      const ctx = this.topEmployeesChart.nativeElement.getContext('2d');
      if (ctx) {
        ctx.clearRect(
          0,
          0,
          this.topEmployeesChart.nativeElement.width,
          this.topEmployeesChart.nativeElement.height,
        );
        ctx.font = '14px Inter';
        ctx.fillStyle = '#868685';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          'Chưa có dữ liệu nhân viên',
          this.topEmployeesChart.nativeElement.width / 2,
          this.topEmployeesChart.nativeElement.height / 2,
        );
      }
    } else {
      this.charts.push(
        new Chart(this.topEmployeesChart.nativeElement, {
          type: 'bar',
          data: {
            labels: topEmp.map((e: any) => e.name),
            datasets: [
              {
                label: 'Số đơn giao thành công',
                data: topEmp.map((e: any) => e.completed),
                backgroundColor: '#9fe870',
                borderColor: '#163300',
                borderWidth: 1,
                barThickness: 22,
                borderRadius: 999,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => ` ${ctx.raw} đơn hoàn tất`,
                },
              },
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: { stepSize: 1 },
                grid: { color: 'rgba(14,15,12,0.08)' },
              },
              y: { grid: { display: false } },
            },
          },
        }),
      );
    }
  }

  private destroyAllCharts() {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  }

  ngOnDestroy(): void {
    this.destroyAllCharts();
  }
}
