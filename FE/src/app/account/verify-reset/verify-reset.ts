import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'verify-reset',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './verify-reset.html',
})
export class VerifyReset {
  code = '';
  userId = '';
  errorMessage = '';
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParams.subscribe((params) => {
        const fromQuery = params['user'];
        const fromStorage = localStorage.getItem('reset_user_id');
        this.userId = fromQuery || fromStorage || '';
      });
    }
  }

  verifyResetCode() {
    if (!this.code || !this.userId) {
      this.errorMessage = 'Thiếu người dùng hoặc mã xác nhận.';
      return;
    }

    this.authService.verifyReset({ _id: this.userId, code: this.code }).subscribe({
      next: () => {
        this.successMessage = 'Xác thực thành công.';
        this.errorMessage = '';
        setTimeout(() => {
          this.router.navigate(['/reset-password'], { queryParams: { user: this.userId } });
        }, 1000);
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Xác minh thất bại.';
        this.successMessage = '';
      },
    });
  }
}
