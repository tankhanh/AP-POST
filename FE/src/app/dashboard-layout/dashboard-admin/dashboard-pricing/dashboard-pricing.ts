import { Component, HostListener, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';
import { env } from '../../../environments/environment';
import { CurrencyInputDirective } from '../../../shared/currency-input.directive';

interface IService {
  _id: string;
  code: string;
  name: string;
}

interface IPricing {
  _id?: string;
  serviceId: string | IService;
  basePrice: number | null;
  overweightThresholdKg: number | null;
  overweightFee: number | null;
  effectiveFrom: string; // input[type=date] value
  effectiveTo: string | null; // input[type=date] value
  isActive: boolean;
}

@Component({
  selector: 'app-dashboard-pricing',
  standalone: true,
  templateUrl: './dashboard-pricing.html',
  styleUrls: ['./dashboard-pricing.scss'],
  imports: [CommonModule, FormsModule, DecimalPipe, DatePipe, CurrencyInputDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardPricingComponent implements OnInit {
  // ====== STATE ======
  pricing: IPricing[] = [];
  services: IService[] = [];

  loading = false;
  saving = false;

  modalOpen = false;
  editing = false;

  selected: IPricing = this.emptyPricing();

  private readonly baseUrl = env.baseUrl;

  constructor(
    private http: HttpClient,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadServices();
    this.loadPricing();
  }

  // ====== HELPERS ======
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token') || '';
    return new HttpHeaders({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
  }

  private emptyPricing(): IPricing {
    const today = new Date().toISOString().slice(0, 10); // yyyy-MM-dd
    return {
      serviceId: '',
      basePrice: null,
      overweightThresholdKg: 5,
      overweightFee: null,
      effectiveFrom: today,
      effectiveTo: null,
      isActive: true,
    };
  }

  private toDateInput(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    return d.toISOString().slice(0, 10);
  }

  getServiceLabel(p: IPricing): string {
    if (p.serviceId && typeof p.serviceId === 'object') {
      const s = p.serviceId as IService;
      return `${s.code} - ${s.name}`;
    }
    const s = this.services.find((x) => x._id === p.serviceId);
    return s ? `${s.code} - ${s.name}` : '—';
  }

  // ====== LOAD DATA ======
  loadServices(): void {
    this.http
      .get<any>(`${this.baseUrl}/services?current=1&pageSize=9999`, {
        headers: this.getAuthHeaders(),
      })
      .subscribe({
        next: (res) => {
          this.services = res?.data?.results || res?.data?.result || res?.results || [];
        },
        error: (err) => {
          console.error('Load services failed', err);
        },
      });
  }

  loadPricing(): void {
    this.loading = true;
    this.http
      .get<any>(`${this.baseUrl}/pricing?current=1&pageSize=9999`, {
        headers: this.getAuthHeaders(),
      })
      .subscribe({
        next: (res) => {
          this.pricing = res?.data?.results || res?.results || res?.data?.result || [];
          this.loading = false;
        },
        error: (err) => {
          console.error('Load pricing failed', err);
          this.loading = false;
        },
      });
  }

  // ====== UI ACTIONS ======
  openCreate(): void {
    this.editing = false;
    this.selected = this.emptyPricing();
    this.modalOpen = true;
  }

  openEdit(p: IPricing): void {
    this.editing = true;
    this.selected = {
      _id: p._id,
      serviceId:
        typeof p.serviceId === 'object' ? (p.serviceId as IService)._id : (p.serviceId as string),
      basePrice: p.basePrice ?? 0,
      overweightThresholdKg: p.overweightThresholdKg ?? 0,
      overweightFee: p.overweightFee ?? 0,
      effectiveFrom: this.toDateInput(p.effectiveFrom),
      effectiveTo: p.effectiveTo ? this.toDateInput(p.effectiveTo) : null,
      isActive: p.isActive,
    };
    this.modalOpen = true;
  }

  closeModal(): void {
    if (this.saving) return;
    this.modalOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeModalOnEscape(): void {
    if (this.modalOpen) this.closeModal();
  }

  // ====== SAVE (CREATE / UPDATE) ======
  save(): void {
    if (!this.selected.serviceId) {
      this.toastr.warning('Vui lòng chọn dịch vụ.', 'Thiếu thông tin');
      return;
    }

    const basePrice = Number(this.selected.basePrice);
    const threshold = Number(this.selected.overweightThresholdKg);
    const overweightFee = Number(this.selected.overweightFee);
    if (!Number.isFinite(basePrice) || basePrice < 0 || basePrice > 1_000_000_000) {
      this.toastr.warning('Giá cơ bản phải từ 0 đến 1 tỷ đồng.', 'Giá không hợp lệ');
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1000) {
      this.toastr.warning('Ngưỡng quá cân phải từ 0 đến 1.000 kg.', 'Khối lượng không hợp lệ');
      return;
    }
    if (!Number.isFinite(overweightFee) || overweightFee < 0 || overweightFee > 1_000_000_000) {
      this.toastr.warning('Phụ phí phải từ 0 đến 1 tỷ đồng.', 'Giá không hợp lệ');
      return;
    }
    if (!this.selected.effectiveFrom) {
      this.toastr.warning('Vui lòng chọn ngày bắt đầu hiệu lực.', 'Thiếu thông tin');
      return;
    }
    if (this.selected.effectiveTo && this.selected.effectiveTo < this.selected.effectiveFrom) {
      this.toastr.warning('Ngày kết thúc phải sau ngày bắt đầu.', 'Khoảng ngày không hợp lệ');
      return;
    }

    const body: any = {
      serviceId: this.selected.serviceId,
      basePrice,
      overweightThresholdKg: threshold,
      overweightFee,
      isActive: this.selected.isActive,
      effectiveFrom: this.selected.effectiveFrom
        ? new Date(this.selected.effectiveFrom)
        : new Date(),
      effectiveTo: this.selected.effectiveTo ? new Date(this.selected.effectiveTo) : null,
    };

    this.saving = true;
    const headers = this.getAuthHeaders();

    if (!this.selected._id) {
      // CREATE
      this.http.post<any>(`${this.baseUrl}/pricing`, body, { headers }).subscribe({
        next: () => {
          this.saving = false;
          this.modalOpen = false;
          this.toastr.success('Đã tạo bảng giá mới.');
          this.loadPricing();
        },
        error: (err) => {
          this.saving = false;
          console.error('Create pricing failed', err);
          this.toastr.error(err?.error?.message || 'Tạo bảng giá thất bại.');
        },
      });
    } else {
      // UPDATE
      this.http
        .patch<any>(`${this.baseUrl}/pricing/${this.selected._id}`, body, {
          headers,
        })
        .subscribe({
          next: () => {
            this.saving = false;
            this.modalOpen = false;
            this.toastr.success('Đã cập nhật bảng giá.');
            this.loadPricing();
          },
          error: (err) => {
            this.saving = false;
            console.error('Update pricing failed', err);
            this.toastr.error(err?.error?.message || 'Cập nhật bảng giá thất bại.');
          },
        });
    }
  }

  // ====== DELETE ======
  async remove(p: IPricing): Promise<void> {
    if (!p._id) return;
    const result = await Swal.fire({
      title: 'Xóa bảng giá?',
      text: 'Hành động này có thể ảnh hưởng tới việc tính cước.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xóa bảng giá',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#d03238',
    });
    if (!result.isConfirmed) return;

    this.http
      .delete<any>(`${this.baseUrl}/pricing/${p._id}`, {
        headers: this.getAuthHeaders(),
      })
      .subscribe({
        next: () => {
          this.toastr.success('Đã xóa bảng giá.');
          this.loadPricing();
        },
        error: (err) => {
          console.error('Delete pricing failed', err);
          this.toastr.error(err?.error?.message || 'Xóa bảng giá thất bại.');
        },
      });
  }
}
