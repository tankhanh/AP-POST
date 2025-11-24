import { Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, NgFor, NgClass, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

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
  imports: [CommonModule, FormsModule, DecimalPipe, DatePipe],
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

  // ⚙️ Đổi lại URL nếu BE khác
  private readonly baseUrl = 'http://localhost:8000/api/v1';

  constructor(private http: HttpClient) {}

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

  // ====== SAVE (CREATE / UPDATE) ======
  save(): void {
    if (!this.selected.serviceId) {
      alert('Vui lòng chọn dịch vụ');
      return;
    }

    const body: any = {
      serviceId: this.selected.serviceId,
      basePrice: Number(this.selected.basePrice || 0),
      overweightThresholdKg: Number(this.selected.overweightThresholdKg || 0),
      overweightFee: Number(this.selected.overweightFee || 0),
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
          this.loadPricing();
        },
        error: (err) => {
          this.saving = false;
          console.error('Create pricing failed', err);
          alert('Tạo bảng giá thất bại (xem console).');
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
            this.loadPricing();
          },
          error: (err) => {
            this.saving = false;
            console.error('Update pricing failed', err);
            alert('Cập nhật bảng giá thất bại (xem console).');
          },
        });
    }
  }

  // ====== DELETE ======
  remove(p: IPricing): void {
    if (!p._id) return;
    if (!confirm('Bạn có chắc muốn xoá bảng giá này?')) return;

    this.http
      .delete<any>(`${this.baseUrl}/pricing/${p._id}`, {
        headers: this.getAuthHeaders(),
      })
      .subscribe({
        next: () => {
          this.loadPricing();
        },
        error: (err) => {
          console.error('Delete pricing failed', err);
          alert('Xoá bảng giá thất bại (xem console).');
        },
      });
  }
}
