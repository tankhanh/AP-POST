import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Register implements OnInit {
  name = '';
  phone = '';
  email = '';
  password = '';
  errorMessage = '';
  successMessage = '';
  isLoading = false;
  acceptedTerms = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit() {}

  register() {
    this.name = this.name.trim().replace(/\s+/g, ' ');
    this.phone = this.phone.replace(/\D/g, '');
    this.email = this.email.trim().toLowerCase();
    if (!this.name || !this.phone || !this.email || !this.password) {
      this.errorMessage = 'Vui lòng nhập đầy đủ thông tin.';
      this.toastr.error(this.errorMessage);
      return;
    }

    if (this.name.length < 2 || this.name.length > 120) {
      this.errorMessage = 'Họ và tên phải có từ 2 đến 120 ký tự.';
      this.toastr.warning(this.errorMessage);
      return;
    }
    if (!/^[0-9]{9,11}$/.test(this.phone)) {
      this.errorMessage = 'Số điện thoại phải gồm 9 đến 11 chữ số.';
      this.toastr.warning(this.errorMessage);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email)) {
      this.errorMessage = 'Địa chỉ email không hợp lệ.';
      this.toastr.warning(this.errorMessage);
      return;
    }
    if (this.password.length < 8 || this.password.length > 72) {
      this.errorMessage = 'Mật khẩu phải có từ 8 đến 72 ký tự.';
      this.toastr.warning(this.errorMessage);
      return;
    }

    if (!this.acceptedTerms) {
      this.errorMessage = 'Vui lòng đồng ý với điều khoản dịch vụ và chính sách bảo mật.';
      this.toastr.warning(this.errorMessage);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const userData = {
      name: this.name,
      phone: this.phone,
      email: this.email,
      password: this.password,
    };

    this.authService.register(userData).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.data?._id) {
          localStorage.setItem('pending_user_id', res.data._id);
          // Lưu email để dùng cho chức năng gửi lại mã
          sessionStorage.setItem('pending_user_email', this.email);
          this.router.navigate(['/verify'], { queryParams: { user: res.data._id } });
        }
        this.successMessage = 'Đăng ký thành công. Vui lòng xác minh email.';
        this.toastr.success(this.successMessage);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Đăng ký thất bại, vui lòng thử lại.';
        this.toastr.error(this.errorMessage);
      },
    });
  }
}
