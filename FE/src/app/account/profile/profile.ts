import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html'
})
export class Profile implements OnInit {
  user: any = {};
  isBrowser = false;

  constructor(
    private authService: AuthService,
    private toastr: ToastrService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      const stored = localStorage.getItem('user');
      if (stored) {
        this.user = JSON.parse(stored);
      }
    }
    console.log('User data:', this.user);
  }

  update() {
    if (!this.isBrowser) return;

    this.authService.updateAccount(this.user._id, this.user).subscribe({
      next: (res) => {
        this.toastr.success('Cập nhật thông tin thành công');
        this.authService.setUser(res.account);
      },
      error: (err) => {
        this.toastr.error(err.error.message || 'Cập nhật thất bại');
      },
    });
  }
}
