import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'forgetpassword',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgetpassword.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ForgetPassword implements OnInit {
  email = '';
  successMessage = '';
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit() {}

  sendResetLink() {
    this.successMessage = '';
    this.errorMessage = '';

    this.email = this.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email)) {
      this.errorMessage = 'Vui lòng nhập địa chỉ email của bạn.';
      this.toastr.warning(this.errorMessage, 'Thiếu thông tin');
      return;
    }

    this.authService.requestPasswordReset(this.email).subscribe({
      next: (res: any) => {
        this.successMessage = 'Mã đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra email.';
        this.toastr.success(this.successMessage, 'Thành công');

        sessionStorage.setItem('reset_email', this.email.trim().toLowerCase());

        this.router.navigate(['/verify-reset']);
      },
      error: (err) => {
        const message = err.error?.message || 'Đã xảy ra lỗi, vui lòng thử lại sau.';
        this.errorMessage = message;
        this.toastr.error(message, 'Lỗi');
      },
    });
  }
}
