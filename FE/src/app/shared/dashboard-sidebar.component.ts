import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface SidebarItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
}

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside class="ap-sidebar">
      <div class="ap-sidebar-inner">
        <div class="ap-sidebar-section">Menu</div>
        <nav class="ap-sidebar-nav">
          <a
            *ngFor="let item of items"
            [routerLink]="item.route"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: false }"
            class="nav-link"
          >
            <iconify-icon [icon]="item.icon"></iconify-icon>
            <span>{{ item.label }}</span>
            <span *ngIf="item.badge" class="badge ms-auto">{{ item.badge }}</span>
          </a>
        </nav>
      </div>
    </aside>
  `,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardSidebarComponent {
  items: SidebarItem[] = [
    { label: 'Dashboard', icon: 'mdi:home-analytics', route: '/employee/dashboard' },
    { label: 'Tạo đơn', icon: 'mdi:package-plus', route: '/employee/order/create' },
    { label: 'Đơn hàng', icon: 'mdi:package-variant-closed', route: '/employee/orders/list' },
    { label: 'Bảng giá', icon: 'mdi:tag-multiple-outline', route: '/employee/pricing' },
    { label: 'Chi nhánh', icon: 'mdi:office-building-marker-outline', route: '/employee/branch' },
    { label: 'Hồ sơ', icon: 'mdi:account-outline', route: '/employee/profile' },
  ];
}
