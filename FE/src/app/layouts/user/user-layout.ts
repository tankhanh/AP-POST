import { isPlatformBrowser, CurrencyPipe } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { Event, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'user-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CurrencyPipe],
  templateUrl: './user-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class UserLayout implements OnInit, OnDestroy {
  isAuthPage = false;
  user: any = null;
  balance = 0;
  isBrowser = false;
  private userSubscription?: Subscription;
  private routerSubscription?: Subscription;

  constructor(
    public authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.isBrowser = isPlatformBrowser(this.platformId);

    if (this.isBrowser) {
      this.userSubscription = this.authService.currentUser$.subscribe((user: any) => {
        if (user) {
          this.user = user;
          this.balance = user.balance ?? 0;
        } else {
          this.user = null;
          this.balance = 0;
        }
      });
    }

    this.routerSubscription = this.router.events.subscribe((evt: Event) => {
      if (evt instanceof NavigationEnd) {
        const url = evt.urlAfterRedirects;
        // Trang không muốn hiện header/footer
        this.isAuthPage =
          url.startsWith('/login') ||
          url.startsWith('/register') ||
          url.startsWith('/forget-password') ||
          url.startsWith('/verify') ||
          url.startsWith('/reset-password') ||
          url.startsWith('/dashboard'); // ẩn header/footer trong khu dashboard nếu bạn muốn
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
    this.toastr.success('Đăng xuất thành công!');
    setTimeout(() => {
      if (this.isBrowser) window.location.href = '/';
    }, 2000);
  }

  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }
}