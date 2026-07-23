import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard-profile.html',
})
export class DashboardProfile implements OnInit {
  user: any = {};
  isBrowser = false;

  constructor(
    private authService: AuthService,
    private toastr: ToastrService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          this.user = JSON.parse(stored);
          this.user.accountType = this.user.accountType || 'LOCAL';
          this.user.role = this.user.role || 'USER';
          this.user.createdAt = this.user.createdAt ? new Date(this.user.createdAt) : new Date();
        } catch {
          localStorage.removeItem('user');
          this.user = {};
        }
      }
    }
  }

  update() {
    if (!this.isBrowser) return;

    // Chỉ cho phép cập nhật các trường người dùng được phép thay đổi
    const updateData: any = {
      name: this.user.name,
      phone: this.user.phone,
    };

    this.authService.updateAccount(this.user._id, updateData).subscribe({
      next: () => {
        this.toastr.success('Cập nhật thông tin thành công');
        // Cập nhật lại user lưu trong localStorage
        this.authService.setUser({
          ...this.user,
          ...updateData,
        });
      },
      error: (err) => {
        this.toastr.error(err.error.message || 'Cập nhật thất bại');
      },
    });
  }
}
