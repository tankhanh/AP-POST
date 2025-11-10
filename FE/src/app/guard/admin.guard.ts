import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): boolean | UrlTree {
    const user = this.authService.getUser(); // hoặc lấy từ localStorage
    if (user && (user.role === 'admin' || user.roles?.includes('admin'))) {
      return true;
    }

    // Nếu không phải admin → chuyển hướng về trang chủ hoặc 403
    return this.router.createUrlTree(['/']);
  }
}