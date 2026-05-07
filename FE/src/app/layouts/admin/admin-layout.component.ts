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
import { NavigationEnd } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { NotificationCenter } from '../../shared/notification-center/notification-center';
import { SoundService } from '../../services/sound.service';

@Component({
  selector: 'admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationCenter],
  templateUrl: './admin-layout.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdminLayout implements OnInit, OnDestroy {
  isAuthPage = false;
  user: any = null;
  balance = 0;
  sidebarOpen = true;
  innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  isBrowser = false;
  private sub?: Subscription;
  private routerSub?: Subscription;

  constructor(
    public authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private sound: SoundService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.sub = this.authService.currentUser$.subscribe((u) => {
      this.user = u;
    });

    // play a sound when admin navigates to dashboard
    this.routerSub = this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationEnd) {
        const url = evt.urlAfterRedirects || '';
        if (/(^|\/)admin(\/|$).*dashboard/.test(url)) {
          try { this.sound.play(); } catch (e) {}
        }
      }
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

  logout() {
    this.authService.logout();
    this.toastr.success('Đăng xuất thành công!');
    setTimeout(() => this.router.navigate(['/']), 500);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.routerSub?.unsubscribe();
  }
}
