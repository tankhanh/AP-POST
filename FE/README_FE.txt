=========================
HƯỚNG DẪN TÍCH HỢP ĐĂNG NHẬP GOOGLE / FACEBOOK VỚI NESTJS
(Frontend: Angular)
=========================

YÊU CẦU:
- NodeJS >= 18
- Angular CLI >= 17
- Đã có backend NestJS hỗ trợ endpoint login qua Google/Facebook OAuth2 (sẽ dùng BE bạn đã tạo)

=========================
B1. KHỞI TẠO DỰ ÁN ANGULAR
=========================
ng new nestjs-auth-fe
cd nestjs-auth-fe
ng serve -o

=========================
B2. CÀI THƯ VIỆN ĐĂNG NHẬP SOCIAL
=========================
npm install @abacritt/angularx-social-login

=========================
B3. TẠO PROJECT TRÊN GOOGLE & FACEBOOK
=========================
GOOGLE:
- Truy cập https://console.cloud.google.com/
- Tạo project mới → OAuth consent screen → Tạo OAuth Client ID (type: Web)
- Thêm Authorized redirect URIs: http://localhost:4200
- Copy Client ID

FACEBOOK:
- Vào https://developers.facebook.com/
- Tạo App mới (type: Consumer)
- Bật Facebook Login → Web
- Điền URL: http://localhost:4200
- Lấy App ID

=========================
B4. CẤU HÌNH SOCIAL LOGIN TRONG APP MODULE
=========================
Mở: src/app/app.module.ts

import {
  SocialLoginModule,
  SocialAuthServiceConfig,
  GoogleLoginProvider,
  FacebookLoginProvider,
} from '@abacritt/angularx-social-login';

@NgModule({
  imports: [
    BrowserModule,
    SocialLoginModule,
    ...
  ],
  providers: [
    {
      provide: 'SocialAuthServiceConfig',
      useValue: {
        autoLogin: false,
        providers: [
          {
            id: GoogleLoginProvider.PROVIDER_ID,
            provider: new GoogleLoginProvider('GOOGLE_CLIENT_ID'),
          },
          {
            id: FacebookLoginProvider.PROVIDER_ID,
            provider: new FacebookLoginProvider('FACEBOOK_APP_ID'),
          },
        ],
      } as SocialAuthServiceConfig,
    },
  ],
})
export class AppModule {}

=========================
B5. TẠO LOGIN COMPONENT
=========================
ng g c pages/login

Trong login.component.ts:

import { SocialAuthService, GoogleLoginProvider, FacebookLoginProvider } from '@abacritt/angularx-social-login';
import { HttpClient } from '@angular/common/http';

constructor(private authService: SocialAuthService, private http: HttpClient) {}

loginWithGoogle() {
  this.authService.signIn(GoogleLoginProvider.PROVIDER_ID).then(user => {
    this.http.post('http://localhost:3000/api/v1/auth/google', {
      token: user.idToken
    }).subscribe(res => {
      // Lưu access_token trả về từ NestJS
      localStorage.setItem('access_token', res['access_token']);
    });
  });
}

loginWithFacebook() {
  this.authService.signIn(FacebookLoginProvider.PROVIDER_ID).then(user => {
    this.http.post('http://localhost:3000/api/v1/auth/facebook', {
      token: user.authToken
    }).subscribe(res => {
      localStorage.setItem('access_token', res['access_token']);
    });
  });
}

=========================
B6. THÊM BUTTON ĐĂNG NHẬP
=========================
login.component.html:

<button (click)="loginWithGoogle()">Đăng nhập bằng Google</button>
<button (click)="loginWithFacebook()">Đăng nhập bằng Facebook</button>

=========================
B7. BẮT TOKEN Ở BE ĐỂ ĐĂNG NHẬP / ĐĂNG KÝ
=========================
- Backend NestJS sẽ nhận `idToken` (Google) hoặc `authToken` (Facebook)
- Gửi tới Google/Facebook API để verify → lấy thông tin user → tạo/sync user → trả về JWT cho FE
- FE lưu JWT vào localStorage hoặc cookie HttpOnly

=========================
B8. SỬ DỤNG JWT CHO API BẢO VỆ
=========================
- Trong Angular thêm `AuthInterceptor` gắn `Authorization: Bearer <token>` vào mọi request
- Khi token hết hạn → gọi endpoint refresh token của BE

=========================
B9. ĐĂNG XUẤT
=========================
- Xóa token khỏi localStorage
- Gọi endpoint logout bên NestJS để xóa refresh_token

=========================
✅ XONG
=========================
