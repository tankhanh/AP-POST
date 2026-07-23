// auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { env } from '../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private refreshRequest$?: Observable<string>;

  constructor(
    private router: Router,
    private authService: AuthService,
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let authReq = req;

    // 👉 Chỉ gắn token cho request đi tới API backend của mình
    if (req.url.startsWith(env.baseUrl)) {
      const token = this.authService.getAccessToken();

      authReq = req.clone({
        withCredentials: true,
        ...(token
          ? {
              setHeaders: {
                Authorization: `Bearer ${token}`,
              },
            }
          : {}),
      });
    }

    return next.handle(authReq).pipe(
      catchError((err: HttpErrorResponse) => {
        const isAuthenticationRequest =
          req.url.endsWith('/auth/login') ||
          req.url.endsWith('/auth/refresh') ||
          req.url.endsWith('/auth/logout');
        if (err.status === 401 && !isAuthenticationRequest && req.url.startsWith(env.baseUrl)) {
          return this.refreshAccessToken().pipe(
            switchMap((token) =>
              next.handle(
                req.clone({
                  withCredentials: true,
                  setHeaders: { Authorization: `Bearer ${token}` },
                }),
              ),
            ),
            catchError((refreshError) => {
              this.authService.clearSession();
              this.router.navigate(['/login'], {
                queryParams: { returnUrl: this.router.url },
              });
              return throwError(() => refreshError);
            }),
          );
        }
        return throwError(() => err);
      }),
    );
  }

  private refreshAccessToken(): Observable<string> {
    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.authService.refreshSession().pipe(
        map((payload) => payload.access_token),
        finalize(() => {
          this.refreshRequest$ = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshRequest$;
  }
}
