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

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) {}

  ngOnInit() {}

  register() {
    if (!this.name || !this.phone || !this.email || !this.password) {
      this.errorMessage = 'Vui lòng nhập đầy đủ thông tin.';
      this.toastr.error(this.errorMessage);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const userData = {
      name: this.name,
      phone: this.phone,
      email: this.email,
      password: this.password,
      status: false,
      balance: 0,
    };

    this.authService.register(userData).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.data?._id) {
          localStorage.setItem('pending_user_id', res.data._id);
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
