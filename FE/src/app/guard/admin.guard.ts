import { Injectable } from '@angular/core';
import {
  CanActivate,
  Router,
  UrlTree,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    const isLoggedIn = this.authService.isLoggedIn();
    const isAdmin = this.authService.isAdmin(); // ✅ dùng hàm đã normalize trong AuthService

    if (isLoggedIn && isAdmin) {
      return true;
    }

    // Nếu chưa login → về /login kèm returnUrl
    if (!isLoggedIn) {
      return this.router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
    }

    return this.router.createUrlTree([this.authService.dashboardUrl()]);
  }
}
