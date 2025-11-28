import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface ShippingRequest {
  originProvinceCode: string;
  destProvinceCode: string;
  serviceCode: 'STD' | 'EXP';
  weightKg: number;
  isLocal: boolean;
}

interface ShippingBreakdown {
  originProvinceCode: string;
  destProvinceCode: string;
  originRegion: string | null;
  destRegion: string | null;
  serviceCode: 'STD' | 'EXP';
  pricingId: string;
  baseServicePrice: number;
  regionFee: number;
  overweightFee: number;
  overweightThresholdKg: number;
  isLocal: boolean;
}

interface ShippingResponse {
  totalPrice: number; // phí ship
  description?: string;
  breakdown: ShippingBreakdown;
}

// thêm type form có COD
type ShippingForm = ShippingRequest & {
  codValue: number;
};

@Component({
  selector: 'app-calculate-shipping',
  standalone: true,
  templateUrl: './user-calculator.html',
  styleUrls: ['./user-calculator.scss'],
  imports: [CommonModule, FormsModule, DecimalPipe],
})
export class CalculateShippingComponent implements OnInit {
  private http = inject(HttpClient);
  // private readonly API_URL = 'http://localhost:8000/api/v1';
  private readonly API_URL = 'https://ap-post-api.onrender.com/api/v1';

  provinceOptions: { value: string; label: string }[] = [];

  formData: ShippingForm = {
    originProvinceCode: '',
    destProvinceCode: '',
    serviceCode: 'STD',
    weightKg: 1,
    isLocal: false,
    codValue: 0,
  };

  loading = false;
  errorMessage = '';
  result: ShippingResponse | null = null;

  serviceOptions = [
    { value: 'STD' as const, label: 'Tiêu chuẩn (STD)' },
    { value: 'EXP' as const, label: 'Nhanh (EXP)' },
  ];

  ngOnInit() {
    this.loadProvinces();
  }

  loadProvinces() {
    this.http.get<{ data: any[] }>(`${this.API_URL}/locations/provinces`).subscribe({
      next: (res) => {
        this.provinceOptions = res.data.map((p) => ({
          value: p.code,
          label: p.name,
        }));
      },
      error: (err) => {
        console.error('Lỗi tải danh sách tỉnh:', err);
        this.errorMessage = 'Không tải được danh sách tỉnh. Vui lòng thử lại sau.';
      },
    });
  }

  submit() {
    this.errorMessage = '';
    this.result = null;

    if (!this.formData.originProvinceCode || !this.formData.destProvinceCode) {
      this.errorMessage = 'Vui lòng chọn đủ tỉnh gửi và tỉnh nhận.';
      return;
    }
    if (!this.formData.weightKg || this.formData.weightKg <= 0) {
      this.errorMessage = 'Khối lượng phải lớn hơn 0.';
      return;
    }

    const payload: ShippingRequest = {
      originProvinceCode: this.formData.originProvinceCode,
      destProvinceCode: this.formData.destProvinceCode,
      serviceCode: this.formData.serviceCode,
      weightKg: Number(this.formData.weightKg),
      isLocal: this.formData.originProvinceCode === this.formData.destProvinceCode,
    };

    this.loading = true;
    this.http
      .post<{ data: ShippingResponse }>(`${this.API_URL}/pricing/calculate`, payload)
      .subscribe({
        next: (res) => {
          this.result = res.data;
          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.errorMessage =
            err?.error?.message || 'Không tính được phí vận chuyển. Vui lòng thử lại.';
          this.loading = false;
        },
      });
  }

  resetForm() {
    this.formData = {
      originProvinceCode: '',
      destProvinceCode: '',
      serviceCode: 'STD',
      weightKg: 1,
      isLocal: false,
      codValue: 0,
    };
    this.result = null;
    this.errorMessage = '';
  }

  // helper: tổng thu hộ
  get totalCollect(): number {
    if (!this.result) return 0;
    return this.result.totalPrice + (this.formData.codValue || 0);
  }
}
