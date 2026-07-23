import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  HostListener,
  Inject,
  PLATFORM_ID,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NotificationCenter } from '../shared/notification-center/notification-center';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, NotificationCenter],
  templateUrl: './dashboard-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardLayout implements OnInit, OnDestroy {
  sidebarOpen = true;
  innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  isBrowser = false;
  user: any = null;
  private userSubscription?: Subscription;

  constructor(
    public authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.innerWidth = window.innerWidth;
      this.sidebarOpen = this.innerWidth >= 992;
      this.userSubscription = this.authService.currentUser$.subscribe((user) => {
        this.user = user;
      });
    }
  }

  @HostListener('window:resize')
  onResize() {
    if (!this.isBrowser) return;
    this.innerWidth = window.innerWidth;
    this.sidebarOpen = this.innerWidth >= 992;
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebarOnMobile() {
    if (this.innerWidth < 992) this.sidebarOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeSidebarOnMobile();
  }

  logout() {
    this.authService.logout();
    this.toastr.success('Đăng xuất thành công!');
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
  }
}
