import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Login implements OnInit {
  email: string;
  password: string;
  errorMessage: string;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.email = '';
    this.password = '';
    this.errorMessage = '';
  }

  login() {
    this.authService.login(this.email, this.password).subscribe({
      next: (res: any) => {
        console.log('Login success:', res);

        const data = res.data || res; // hỗ trợ cả hai trường hợp

        if (!data.user) {
          this.toastr.error('Dữ liệu người dùng không hợp lệ.');
          return;
        }

        // Nếu tài khoản chưa được xác minh
        if (data.user.status === false) {
          localStorage.setItem('pending_user_id', data.user._id);
          this.toastr.warning(
            'Tài khoản của bạn chưa được xác minh. Đang chuyển đến trang xác minh...',
            'Chú ý',
            { timeOut: 3000 }
          );
          this.router.navigate(['/verify']);
          return;
        }

        // Nếu tài khoản đã xác minh
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('userId', data.user._id);

        this.authService.setUser(data.user);
        this.router.navigate(['/']);
        this.toastr.success('Đăng nhập thành công!');
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Đăng nhập thất bại!';
        this.toastr.error(this.errorMessage);
      },
    });
  }
}
