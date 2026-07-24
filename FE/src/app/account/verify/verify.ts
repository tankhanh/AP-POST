import { Component, Inject, PLATFORM_ID, CUSTOM_ELEMENTS_SCHEMA  } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'verify',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './verify.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Verify {
  code = '';
  errorMessage = '';
  successMessage = '';
  userId = '';
  isResending = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object,
    private toastr: ToastrService,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParams.subscribe((params) => {
        const fromQuery = params['user'];
        const fromStorage = localStorage.getItem('pending_user_id');
        this.userId = fromQuery || fromStorage || '';
      });
    } else {
      this.userId = '';
    }
  }

  verifyCode() {
    if (!this.code || !this.userId) {
      this.errorMessage = 'Thiếu người dùng hoặc mã xác nhận.';
      return;
    }

    this.authService.verify({ _id: this.userId, code: this.code }).subscribe({
      next: () => {
        this.successMessage = 'Tài khoản đã được kích hoạt.';
        this.errorMessage = '';

        if (isPlatformBrowser(this.platformId)) {
          localStorage.removeItem('pending_user_id');
        }

        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Xác minh thất bại.';
        this.successMessage = '';
      },
    });
  }

  retryCode() {
    if (!this.userId) {
      this.errorMessage = 'Thiếu thông tin người dùng.';
      return;
    }

    this.isResending = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Need to get email from pending_user or call retry-active with user data
    // The BE retry-active endpoint expects email, so we need to get the user email
    // We stored pending_user_id in localStorage, but not the email.
    // Let's fetch the user data or pass something meaningful.
    // Actually the BE `retryActive` only needs email. But we only have _id.
    // We need to check if there's a way to get email.
    // The simplest approach: Store email in sessionStorage when registering.
    const pendingEmail = isPlatformBrowser(this.platformId) 
      ? sessionStorage.getItem('pending_user_email') || ''
      : '';

    if (!pendingEmail) {
      this.toastr.error('Không tìm thấy email để gửi lại mã.');
      this.isResending = false;
      return;
    }

    this.authService.resendVerificationCode(pendingEmail).subscribe({
      next: (res: any) => {
        this.isResending = false;
        this.successMessage = 'Mã xác nhận đã được gửi lại. Vui lòng kiểm tra email.';
        this.toastr.success(this.successMessage);
        if (res?.data?._id) {
          this.userId = res.data._id;
        }
      },
      error: (err) => {
        this.isResending = false;
        this.errorMessage = err.error?.message || 'Gửi lại mã thất bại. Vui lòng thử lại sau.';
        this.toastr.error(this.errorMessage);
      },
    });
  }
}
