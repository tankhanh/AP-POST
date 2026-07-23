import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RoleGuard } from './role.guard';

describe('RoleGuard', () => {
  let guard: RoleGuard;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getUser', 'hasRole', 'dashboardUrl']);
    auth.getUser.and.returnValue({ role: 'USER' });
    auth.dashboardUrl.and.returnValue('/customer/dashboard');

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    guard = TestBed.inject(RoleGuard);
  });

  it('allows a matching role', () => {
    auth.hasRole.and.returnValue(true);
    const route = { data: { roles: ['USER'] } } as unknown as ActivatedRouteSnapshot;
    expect(guard.canActivate(route)).toBeTrue();
  });

  it('redirects a mismatched role to its own dashboard', () => {
    auth.hasRole.and.returnValue(false);
    const route = { data: { roles: ['STAFF'] } } as unknown as ActivatedRouteSnapshot;
    const result = guard.canActivate(route) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/customer/dashboard');
  });
});
