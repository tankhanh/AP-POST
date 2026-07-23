import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Login implements OnInit {
  email = '';
  password = '';
  errorMessage = '';
  returnUrl: string | null = null;
  isLoading = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
  }

  login() {
    this.errorMessage = '';
    this.isLoading = true;

    this.authService.login(this.email, this.password).subscribe({
      next: (res: any) => {
        this.isLoading = false;

        const data = res?.data || res;

        if (!data?.user) {
          this.toastr.error('Dữ liệu người dùng không hợp lệ.');
          return;
        }

        if (data.user.status === false) {
          localStorage.setItem('pending_user_id', data.user._id);
          this.toastr.warning(
            'Tài khoản của bạn chưa được xác minh. Đang chuyển đến trang xác minh...',
            'Chú ý',
            { timeOut: 3000 },
          );
          this.router.navigate(['/verify']);
          return;
        }

        localStorage.setItem('access_token', data.access_token);
        this.authService.setUser(data.user);
        localStorage.setItem('userId', data.user._id);

        this.toastr.success('Đăng nhập thành công!');

        if (this.authService.isAdmin(data.user)) {
          this.router.navigateByUrl('/admin/dashboard');
        } else if (this.authService.isShipper(data.user)) {
          this.router.navigateByUrl('/shipper');
        } else if (this.authService.isEmployee(data.user)) {
          this.router.navigateByUrl('/employee/dashboard');
        } else if (this.authService.isCustomer(data.user)) {
          // Customers: prefer returnUrl when present, otherwise send to customer dashboard
          if (this.isSafeReturnUrl(this.returnUrl)) {
            this.router.navigateByUrl(this.returnUrl);
          } else {
            this.router.navigateByUrl('/customer/dashboard');
          }
        } else if (this.isSafeReturnUrl(this.returnUrl)) {
          this.router.navigateByUrl(this.returnUrl);
        } else {
          this.router.navigateByUrl('/');
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message || 'Đăng nhập thất bại, vui lòng thử lại.';
        this.toastr.error(this.errorMessage, 'Lỗi');
      },
    });
  }

  private isSafeReturnUrl(url: string | null): url is string {
    return Boolean(url && url.startsWith('/') && !url.startsWith('//') && url !== '/login');
  }
}
