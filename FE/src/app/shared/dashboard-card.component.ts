import { Component, Input, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="ap-chart-card h-100">
      <div class="d-flex align-items-center gap-3 mb-3">
        <span class="ap-metric-icon" [style.background]="iconBackground" [style.color]="iconColor">
          <iconify-icon [icon]="icon"></iconify-icon>
        </span>
        <div>
          <h3 class="mb-1">{{ title }}</h3>
          <p class="mb-0 small text-muted">{{ subtitle }}</p>
        </div>
      </div>
      <ng-content></ng-content>
    </section>
  `,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() icon = 'mdi:package';
  @Input() iconColor = 'var(--wise-green)';
  @Input() iconBackground = 'var(--wise-lime)';
}

