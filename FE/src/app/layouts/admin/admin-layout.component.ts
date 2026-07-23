import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../services/auth.service';
import { NotificationCenter } from '../../shared/notification-center/notification-center';

@Component({
  selector: 'admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationCenter],
  templateUrl: './admin-layout.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdminLayout implements OnInit, OnDestroy {
  user: any = null;
  sidebarOpen = true;
  innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  isBrowser = false;
  private sub?: Subscription;

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
    }
    this.sub = this.authService.currentUser$.subscribe((u) => {
      this.user = u;
    });
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

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
