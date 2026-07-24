import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { env } from '../environments/environment';

interface StoredUser {
  _id?: string;
  email?: string;
  name?: string;
  role?: string;
  roles?: string[];
  [key: string]: unknown;
}

interface AuthPayload {
  access_token: string;
  user: StoredUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authUrl = `${env.baseUrl}/auth`;
  private readonly usersUrl = `${env.baseUrl}/users`;
  private readonly isBrowser: boolean;
  private readonly userSubject: BehaviorSubject<StoredUser | null>;

  readonly currentUser$: Observable<StoredUser | null>;

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.userSubject = new BehaviorSubject<StoredUser | null>(this.readJson<StoredUser>('user'));
    this.currentUser$ = this.userSubject.asObservable();
  }

  setUser(user: StoredUser): void {
    if (!this.isBrowser) return;
    localStorage.setItem('user', JSON.stringify(user));
    this.userSubject.next(user);
  }

  login(email: string, password: string): Observable<unknown> {
    return this.http.post(`${this.authUrl}/login`, {
      username: email,
      password,
    });
  }

  register(userData: {
    name: string;
    phone: string;
    email: string;
    password: string;
  }): Observable<{ data?: { _id?: string }; _id?: string }> {
    return this.http.post(`${this.authUrl}/register`, userData);
  }

  logout(): void {
    if (!this.isBrowser) return;
    this.http.post(`${this.authUrl}/logout`, {}, { withCredentials: true }).subscribe({
      error: () => undefined,
    });
    this.clearSession();
  }

  clearSession(): void {
    if (!this.isBrowser) return;
    for (const key of ['user', 'access_token', 'refresh_token', 'userId']) {
      localStorage.removeItem(key);
    }
    this.userSubject.next(null);
  }

  isLoggedIn(): boolean {
    if (!this.isBrowser) return false;
    return Boolean(localStorage.getItem('access_token'));
  }

  getAccessToken(): string {
    return this.isBrowser ? localStorage.getItem('access_token') || '' : '';
  }

  refreshSession(): Observable<AuthPayload> {
    return this.http
      .post<{ data?: AuthPayload } & Partial<AuthPayload>>(
        `${this.authUrl}/refresh`,
        {},
        { withCredentials: true },
      )
      .pipe(
        map((response) => (response.data ?? response) as AuthPayload),
        tap((payload) => {
          if (!payload.access_token || !payload.user) {
            throw new Error('Invalid refresh response');
          }
          localStorage.setItem('access_token', payload.access_token);
          localStorage.setItem('userId', String(payload.user._id ?? ''));
          this.setUser(payload.user);
        }),
      );
  }

  verify(data: { _id: string; code: string }): Observable<unknown> {
    return this.http.post(`${this.authUrl}/check-code`, data);
  }

  resendVerificationCode(email: string): Observable<unknown> {
    return this.http.post(`${this.authUrl}/retry-active`, { email });
  }

  requestPasswordReset(email: string): Observable<unknown> {
    return this.http.post(`${this.authUrl}/retry-password`, { email });
  }

  verifyReset(data: { email: string; code: string }): Observable<unknown> {
    return this.http.post(`${this.authUrl}/verify-reset`, data);
  }

  resetPassword(data: {
    email: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }): Observable<unknown> {
    return this.http.post(`${this.authUrl}/reset-password`, data);
  }

  updateAccount(id: string, data: unknown): Observable<unknown> {
    return this.http.patch(`${this.usersUrl}/${id}`, data);
  }

  getUser(): StoredUser {
    return this.readJson<StoredUser>('user') ?? {};
  }

  hasRole(role: string, user: StoredUser = this.getUser()): boolean {
    const roles = [
      ...(Array.isArray(user.roles) ? user.roles : []),
      ...(user.role ? [user.role] : []),
    ]
      .filter(Boolean)
      .map((value) =>
        String(value)
          .trim()
          .replace(/[,\s;]+/g, '')
          .toLowerCase(),
      );
    return roles.includes(role.trim().toLowerCase());
  }

  isAdmin(user?: StoredUser): boolean {
    return this.hasRole('admin', user);
  }

  isEmployee(user?: StoredUser): boolean {
    return this.hasRole('staff', user);
  }

  isCustomer(user?: StoredUser): boolean {
    return this.hasRole('user', user);
  }

  isShipper(user?: StoredUser): boolean {
    return this.hasRole('shipper', user);
  }

  dashboardUrl(user: StoredUser = this.getUser()): string {
    if (this.isAdmin(user)) return '/admin/dashboard';
    if (this.isShipper(user)) return '/shipper';
    if (this.isEmployee(user)) return '/employee/dashboard';
    if (this.isCustomer(user)) return '/customer/dashboard';
    return '/';
  }

  private readJson<T>(key: string): T | null {
    if (!this.isBrowser) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }
}
