import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  HostListener,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { SoundService } from '../../services/sound.service';
import { NotificationCenter } from '../../shared/notification-center/notification-center';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'employee-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, NotificationCenter],
  templateUrl: './employee-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class EmployeeLayout implements OnInit, OnDestroy {
  isAuthPage = false;
  user: any = null;
  balance = 0;
  isBrowser = false;
  sidebarOpen = true;
  innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  private userSubscription?: Subscription;
  private routerSubscription?: Subscription;
  accountOpen = false;

  constructor(
    public authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private sound: SoundService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.isBrowser = isPlatformBrowser(this.platformId);

    if (this.isBrowser) {
      this.userSubscription = this.authService.currentUser$.subscribe((user) => {
        this.user = user || null;
      });
    }

    this.checkUrl(this.router.url);

    this.routerSubscription = this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationEnd) {
        // play a small sound when entering the dashboard area to give auditory feedback
        const url = evt.urlAfterRedirects || '';
        if (/(^|\/)employee(\/|$).*dashboard/.test(url) || /(^|\/)customer(\/|$).*dashboard/.test(url)) {
          try { this.sound.play(); } catch (e) {}
        }
        this.checkUrl(evt.urlAfterRedirects);
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

  private checkUrl(url: string) {
    this.isAuthPage =
      url.startsWith('/login') ||
      url.startsWith('/register') ||
      url.startsWith('/forget-password') ||
      url.startsWith('/verify') ||
      url.startsWith('/reset-password') ||
      url.startsWith('/employee/') ||
      url.startsWith('/customer/');
  }

  logout() {
    this.closeAccount();
    this.authService.logout();
    this.router.navigate(['/']);
    this.toastr.success('Đăng xuất thành công!');
    setTimeout(() => {
      if (this.isBrowser) window.location.href = '/';
    }, 800);
  }

  toggleAccount(event?: Event) {
    if (event) event.stopPropagation();
    this.accountOpen = !this.accountOpen;
  }

  closeAccount() {
    this.accountOpen = false;
  }

  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }
}
