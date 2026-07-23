import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'verify-reset',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './verify-reset.html',
})
export class VerifyReset {
  code = '';
  email = '';
  errorMessage = '';
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParams.subscribe((params) => {
        const fromQuery = params['email'];
        const fromStorage = sessionStorage.getItem('reset_email');
        this.email = fromQuery || fromStorage || '';
      });
    }
  }

  verifyResetCode() {
    if (!this.code || !this.email) {
      this.errorMessage = 'Thiếu người dùng hoặc mã xác nhận.';
      return;
    }

    this.authService.verifyReset({ email: this.email, code: this.code }).subscribe({
      next: () => {
        this.successMessage = 'Xác thực thành công.';
        this.errorMessage = '';
        setTimeout(() => {
          sessionStorage.setItem('reset_code', this.code);
          this.router.navigate(['/reset-password']);
        }, 1000);
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Xác minh thất bại.';
        this.successMessage = '';
      },
    });
  }
}
