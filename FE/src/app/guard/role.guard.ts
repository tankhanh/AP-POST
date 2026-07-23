import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const requiredRoles = (route.data['roles'] as string[] | undefined) ?? [];
    const user = this.authService.getUser();

    if (
      requiredRoles.length === 0 ||
      requiredRoles.some((role) => this.authService.hasRole(role, user))
    ) {
      return true;
    }

    return this.router.createUrlTree([this.authService.dashboardUrl(user)]);
  }
}
