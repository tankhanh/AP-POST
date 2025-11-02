import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, NgZone, AfterViewInit, OnDestroy } from '@angular/core';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-home.html',
})
export class DashboardHome implements AfterViewInit, OnDestroy {
  private orderChart!: Chart;
  private topChart!: Chart;

  @ViewChild('orderChartCanvas') orderChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topChartCanvas') topChartCanvas!: ElementRef<HTMLCanvasElement>;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => this.renderCharts(), 100);
    });
  }

  private renderCharts(): void {
    this.orderChart = new Chart(this.orderChartCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
        datasets: [
          {
            label: 'Giao thành công',
            data: [12, 19, 3, 5, 2, 3, 7],
            borderColor: 'green',
            fill: false,
            tension: 0.3,
          },
          {
            label: 'Đã hoàn',
            data: [2, 3, 1, 4, 0, 2, 1],
            borderColor: 'red',
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
      },
    });

    this.topChart = new Chart(this.topChartCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['SP A', 'SP B', 'SP C', 'SP D'],
        datasets: [
          {
            data: [30, 20, 25, 25],
            backgroundColor: ['#dc3545', '#0d6efd', '#ffc107', '#20c997'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.2,
      },
    });
  }

  ngOnDestroy(): void {
    this.orderChart?.destroy();
    this.topChart?.destroy();
  }
}
