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
  isBrowser = false;
  private userSubscription?: Subscription;
  private routerSubscription?: Subscription;
  accountOpen = false;
  publicMenuOpen = false;
  showScrollToTop = false;

  constructor(
    public authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    @Inject(PLATFORM_ID) private platformId: Object,
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
        this.checkUrl(evt.urlAfterRedirects);
        this.publicMenuOpen = false;
        this.accountOpen = false;
      }
    });
  }

  @HostListener('window:scroll')
  onScroll() {
    if (!this.isBrowser) return;
    this.showScrollToTop = window.scrollY > 100;
  }

  togglePublicMenu() {
    this.publicMenuOpen = !this.publicMenuOpen;
    if (this.publicMenuOpen) this.accountOpen = false;
  }

  scrollToTop() {
    if (this.isBrowser) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get orderSupportLink(): any[] {
    if (!this.authService.isLoggedIn()) return ['/ship'];
    if (this.authService.isAdmin(this.user)) return ['/admin/dashboard'];
    if (this.authService.isShipper(this.user)) return ['/shipper'];
    if (this.authService.isEmployee(this.user)) return ['/employee/dashboard'];
    return ['/customer/dashboard'];
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
  }

  toggleAccount(event?: Event) {
    if (event) event.stopPropagation();
    this.accountOpen = !this.accountOpen;
  }

  closeAccount() {
    this.accountOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeMenus() {
    this.accountOpen = false;
    this.publicMenuOpen = false;
  }

  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }
}
