import { AsyncPipe, CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { Event, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CurrencyPipe],
  templateUrl: './app.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class App implements OnInit, OnDestroy {
  isAuthPage = false;
  user: any = null;
  balance = 0;
  isBrowser = false;
  private userSubscription: Subscription;

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

    this.router.events.subscribe((evt: Event) => {
      if (evt instanceof NavigationEnd) {
        const url = evt.urlAfterRedirects;

        this.isAuthPage =
          url.startsWith('/login') ||
          url.startsWith('/register') ||
          url.startsWith('/forget-password') ||
          url.startsWith('/verify') ||
          url.startsWith('/reset-password')||
          url.startsWith('/dashboard');
      }
    });
  }
  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
    this.toastr.success('Đăng xuất thành công!');
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}
