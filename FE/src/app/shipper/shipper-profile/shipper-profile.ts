import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-shipper-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './shipper-profile.html',
  styleUrl: './shipper-profile.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShipperProfile {
  private readonly fb = inject(FormBuilder);
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly user = this.authService.getUser();
  saving = false;
  saved = false;
  error = '';
  readonly form = this.fb.group({
    name: [String(this.user['name'] || ''), [Validators.required, Validators.maxLength(120)]],
    phone: [String(this.user['phone'] || ''), [Validators.pattern(/^[0-9]{9,15}$/)]],
    address: [String(this.user['address'] || ''), [Validators.maxLength(300)]],
    isAvailable: [this.user['isAvailable'] !== false],
    vehicleType: [String(this.user['vehicleType'] || 'MOTORBIKE')],
    licensePlate: [
      String(this.user['licensePlate'] || ''),
      [Validators.pattern(/^[A-Za-z0-9.-]{5,15}$/)],
    ],
  });

  async save() {
    if (this.form.invalid || !this.user._id) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.error = '';
    try {
      await firstValueFrom(this.authService.updateAccount(this.user._id, this.form.getRawValue()));
      this.authService.setUser({ ...this.user, ...this.form.getRawValue() });
      this.saved = true;
      window.setTimeout(() => (this.saved = false), 1800);
    } catch (error: any) {
      this.error = error.error?.message || 'Không thể cập nhật hồ sơ.';
    } finally {
      this.saving = false;
    }
  }

  logout() {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}
