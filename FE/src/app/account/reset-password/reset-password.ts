import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  newPassword = '';
  confirmPassword = '';
  email = '';
  code = '';
  message = '';
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
  ) {
    this.route.queryParams.subscribe((params) => {
      this.email = params['email'] || sessionStorage.getItem('reset_email') || '';
      this.code = sessionStorage.getItem('reset_code') || '';
    });
  }

  resetPassword() {
    this.message = '';
    this.errorMessage = '';

    if (!this.email || !this.code || !this.newPassword || !this.confirmPassword) {
      this.errorMessage = 'Vui lòng nhập đầy đủ thông tin.';
      this.toastr.warning(this.errorMessage, 'Thiếu thông tin');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'Mật khẩu không khớp.';
      this.toastr.error(this.errorMessage, 'Lỗi');
      return;
    }

    this.authService
      .resetPassword({
        email: this.email,
        code: this.code,
        newPassword: this.newPassword,
        confirmPassword: this.confirmPassword,
      })
      .subscribe({
        next: () => {
          this.message = 'Đổi mật khẩu thành công.';
          this.toastr.success(this.message, 'Thành công');

          sessionStorage.removeItem('reset_email');
          sessionStorage.removeItem('reset_code');
          setTimeout(() => this.router.navigate(['/login']), 1500);
        },
        error: (err) => {
          this.errorMessage = err.error?.message || 'Đổi mật khẩu không hợp lệ.';
          this.toastr.error(this.errorMessage, 'Lỗi');
        },
      });
  }
}
