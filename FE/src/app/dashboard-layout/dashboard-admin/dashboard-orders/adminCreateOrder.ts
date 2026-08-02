import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OrdersService } from '../../../services/dashboard/orders.service';
import { LocationService } from '../../../services/location.service';
import { Router, RouterModule } from '@angular/router';
import Swal from 'sweetalert2';
import { MapPickerComponent } from '../../../shared/map-picker/map-picker';
import { GeocodingService } from '../../../services/geocoding.service';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { firstValueFrom, merge } from 'rxjs';
import { DualMapComponent } from '../../../shared/app-dual-map/app-dual-map';
import { PaymentRecoveryService } from '../../../services/payment-recovery.service';
import { CurrencyInputDirective } from '../../../shared/currency-input.directive';

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DualMapComponent, CurrencyInputDirective],
  templateUrl: './adminCreateOrder.html',
})
export class AdmninCreateOrder implements OnInit, AfterViewInit {
  orderForm!: FormGroup;
  loading = false;
  provinces: any[] = [];
  pickupCommunes: any[] = [];
  deliveryCommunes: any[] = [];
  shippingFee = 0;
  senderPay = 0;
  receiverPay = 0;
  paymentNote = '';
  private clientRequestId = this.newClientRequestId();

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private router: Router,
    private geocoding: GeocodingService,
    private paymentRecovery: PaymentRecoveryService,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      // Tự động cập nhật bản đồ khi thay đổi Tỉnh / Phường
      this.orderForm.get('pickupProvinceId')?.valueChanges.subscribe(() => this.autoUpdatePickup());
      this.orderForm.get('pickupCommuneId')?.valueChanges.subscribe(() => this.autoUpdatePickup());
      this.orderForm
        .get('pickupDetailAddress')
        ?.valueChanges.pipe(debounceTime(800))
        .subscribe(() => this.autoUpdatePickup());

      this.orderForm
        .get('deliveryProvinceId')
        ?.valueChanges.subscribe(() => this.autoUpdateDelivery());
      this.orderForm
        .get('deliveryCommuneId')
        ?.valueChanges.subscribe(() => this.autoUpdateDelivery());
      this.orderForm
        .get('deliveryDetailAddress')
        ?.valueChanges.pipe(debounceTime(800))
        .subscribe(() => this.autoUpdateDelivery());

      // Tính phí
      merge(
        this.orderForm.get('pickupProvinceId')!.valueChanges,
        this.orderForm.get('deliveryProvinceId')!.valueChanges,
        this.orderForm.get('weightKg')!.valueChanges,
        this.orderForm.get('serviceCode')!.valueChanges,
        this.orderForm.get('codValue')!.valueChanges,
        this.orderForm.get('shippingFeePayer')!.valueChanges.pipe(startWith('SENDER')),
        this.orderForm.get('paymentMethod')!.valueChanges.pipe(startWith('CASH')),
      )
        .pipe(debounceTime(300))
        .subscribe(() => this.calculateShippingFee());

      this.calculateShippingFee();
      this.updatePayments();
    }, 200);
  }

  private autoUpdatePickup() {
    this.updatePickupMap();
  }

  private autoUpdateDelivery() {
    this.updateDeliveryMap();
  }

  private shouldSearch(type: 'pickup' | 'delivery'): boolean {
    const f = this.orderForm.value;
    const detail = type === 'pickup' ? f.pickupDetailAddress : f.deliveryDetailAddress;
    const provinceId = type === 'pickup' ? f.pickupProvinceId : f.deliveryProvinceId;
    const communeId = type === 'pickup' ? f.pickupCommuneId : f.deliveryCommuneId;
    return !!(detail && detail.trim().length >= 3 && provinceId && communeId);
  }

  initForm() {
    this.orderForm = this.fb.group({
      senderName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      receiverName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      receiverPhone: ['', [Validators.required, Validators.pattern('^[0-9]{9,11}$')]],
      pickupProvinceId: ['', Validators.required],
      pickupCommuneId: ['', Validators.required],
      pickupDetailAddress: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(300)]],
      deliveryProvinceId: ['', Validators.required],
      deliveryCommuneId: ['', Validators.required],
      deliveryDetailAddress: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(300)]],
      serviceCode: ['STD'],
      weightKg: [1, [Validators.required, Validators.min(0.01), Validators.max(1000)]],
      codValue: [0, [Validators.required, Validators.min(0), Validators.max(1_000_000_000)]],
      email: ['', [Validators.email, Validators.maxLength(254)]],
      details: ['', Validators.maxLength(500)],
      pickupLat: [null],
      pickupLng: [null],
      deliveryLat: [null],
      deliveryLng: [null],
      shippingFeePayer: ['SENDER'],
      paymentMethod: ['CASH'],
    });
  }

  loadProvinces() {
    this.locationService.getProvinces().subscribe({
      next: (res) => (this.provinces = res.data || []),
      error: (err) => console.error('Load provinces failed', err),
    });
  }

  onPickupProvinceChange() {
    const id = this.orderForm.get('pickupProvinceId')?.value;
    if (!id) {
      this.pickupCommunes = [];
      return;
    }
    this.locationService.getCommunes(id).subscribe({
      next: (res) => {
        this.pickupCommunes = res.data || [];
        this.orderForm.get('pickupCommuneId')?.setValue('');
      },
      error: (err) => console.error(err),
    });
  }

  onDeliveryProvinceChange() {
    const id = this.orderForm.get('deliveryProvinceId')?.value;
    if (!id) {
      this.deliveryCommunes = [];
      return;
    }
    this.locationService.getCommunes(id).subscribe({
      next: (res) => {
        this.deliveryCommunes = res.data || [];
        this.orderForm.get('deliveryCommuneId')?.setValue('');
      },
      error: (err) => console.error(err),
    });
  }

  async updatePickupMap() {
    const f = this.orderForm.value;
    if (!f.pickupProvinceId || !f.pickupCommuneId) return;

    const provinceName = this.getProvinceName(f.pickupProvinceId);
    const communeName = this.getCommuneName(f.pickupCommuneId);
    const detail = f.pickupDetailAddress?.trim() || '';

    const queries = [
      detail ? `${detail}, ${communeName}, ${provinceName}, Việt Nam` : '',
      `${communeName}, ${provinceName}, Việt Nam`,
      `${provinceName}, Việt Nam`,
    ].filter(Boolean);

    for (const q of queries) {
      try {
        const res = await firstValueFrom(this.geocoding.search(q));
        if (res?.length > 0) {
          const { lat, lon } = res[0];
          this.orderForm.patchValue({ pickupLat: parseFloat(lat), pickupLng: parseFloat(lon) });
          return;
        }
      } catch (e) {
        console.warn('Geocoding pickup error', e);
      }
    }
  }

  async updateDeliveryMap() {
    const f = this.orderForm.value;
    if (!f.deliveryProvinceId || !f.deliveryCommuneId) return;

    const provinceName = this.getProvinceName(f.deliveryProvinceId);
    const communeName = this.getCommuneName(f.deliveryCommuneId);
    const detail = f.deliveryDetailAddress?.trim() || '';

    const queries = [
      detail ? `${detail}, ${communeName}, ${provinceName}, Việt Nam` : '',
      `${communeName}, ${provinceName}, Việt Nam`,
      `${provinceName}, Việt Nam`,
    ].filter(Boolean);

    for (const q of queries) {
      try {
        const res = await firstValueFrom(this.geocoding.search(q));
        if (res?.length > 0) {
          const { lat, lon } = res[0];
          this.orderForm.patchValue({ deliveryLat: parseFloat(lat), deliveryLng: parseFloat(lon) });
          return;
        }
      } catch (e) {
        console.warn('Geocoding delivery error', e);
      }
    }
  }

  getProvinceName(id: string) {
    return this.provinces.find((p) => p._id === id)?.name || '';
  }

  getCommuneName(id: string) {
    return (
      this.pickupCommunes.find((c) => c._id === id)?.name ||
      this.deliveryCommunes.find((c) => c._id === id)?.name ||
      ''
    );
  }

  private updatePayments() {
    const cod = Number(this.orderForm.value.codValue || 0);
    let payer = this.orderForm.value.shippingFeePayer || 'SENDER';
    const method = this.orderForm.value.paymentMethod || 'CASH';

    if (method === 'MOMO' && payer !== 'SENDER') {
      payer = 'SENDER';
      this.orderForm.get('shippingFeePayer')?.setValue('SENDER', { emitEvent: false });
    }

    if (method === 'CASH') {
      this.senderPay = payer === 'SENDER' ? this.shippingFee : 0;
      this.receiverPay = cod + (payer === 'RECEIVER' ? this.shippingFee : 0);
      this.paymentNote = 'Người gửi trả phí ship tại quầy';
    } else if (method === 'COD') {
      this.senderPay = 0;
      this.receiverPay = cod + this.shippingFee;
      this.paymentNote = 'Người nhận trả COD + phí (nếu có)';
    } else if (method === 'MOMO') {
      this.senderPay = this.shippingFee + cod;
      this.receiverPay = 0;
      this.paymentNote = `Thanh toán trực tuyến qua ${method}`;
    }
  }

  async calculateShippingFee() {
    const f = this.orderForm.value;
    if (!f.pickupProvinceId || !f.deliveryProvinceId || !f.weightKg) {
      this.shippingFee = 0;
      this.updatePayments();
      return;
    }

    const originProv = this.provinces.find((p) => p._id === f.pickupProvinceId);
    const destProv = this.provinces.find((p) => p._id === f.deliveryProvinceId);

    if (!originProv?.code || !destProv?.code) {
      this.shippingFee = 0;
      this.updatePayments();
      return;
    }

    const isSameProvince = f.pickupProvinceId === f.deliveryProvinceId;

    try {
      const res: any = await firstValueFrom(
        this.ordersService.calculateShippingFee({
          originProvinceCode: originProv.code,
          destProvinceCode: destProv.code,
          serviceCode: f.serviceCode || 'STD',
          weightKg: Number(f.weightKg),
          isLocal: isSameProvince,
        }),
      );
      this.shippingFee = res.data?.totalPrice ?? res.totalPrice ?? 0;
    } catch (err) {
      console.warn('Lỗi tính phí:', err);
      this.shippingFee = 0;
    } finally {
      this.updatePayments();
    }
  }

  onPickupMoved(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ pickupLat: pos.lat, pickupLng: pos.lng });
  }

  onDeliveryMoved(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ deliveryLat: pos.lat, deliveryLng: pos.lng });
  }

  onLocationReverse(event: {
    type: 'pickup' | 'delivery';
    lat: number;
    lng: number;
    address?: string;
  }) {
    if (!event.address) return;

    const addr = event.address.trim();
    let detailAddress = addr;

    const currentCommune = this.getCommuneName(
      event.type === 'pickup'
        ? this.orderForm.value.pickupCommuneId
        : this.orderForm.value.deliveryCommuneId,
    );

    const currentProvince = this.getProvinceName(
      event.type === 'pickup'
        ? this.orderForm.value.pickupProvinceId
        : this.orderForm.value.deliveryProvinceId,
    );

    if (currentCommune) detailAddress = detailAddress.split(currentCommune)[0] || detailAddress;
    if (currentProvince) detailAddress = detailAddress.split(currentProvince)[0] || detailAddress;

    detailAddress = detailAddress
      .replace(/,?\s*Việt Nam.*$/i, '')
      .replace(/,?\s*Hồ Chí Minh.*$/i, '')
      .replace(/,?\s*TP\.?\s?HCM.*$/i, '')
      .replace(/,\s*$/, '')
      .trim();

    const controlName = event.type === 'pickup' ? 'pickupDetailAddress' : 'deliveryDetailAddress';
    this.orderForm.get(controlName)?.setValue(detailAddress || '');
  }

  // ==================== SUBMIT - ĐÃ SỬA HOÀN CHỈNH ====================
  submit() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    const data = {
      clientRequestId: this.clientRequestId,
      senderName: this.orderForm.value.senderName,
      receiverName: this.orderForm.value.receiverName,
      receiverPhone: this.orderForm.value.receiverPhone,
      email: this.orderForm.value.email?.trim() || null,
      pickupAddress: {
        provinceId: this.orderForm.value.pickupProvinceId,
        communeId: this.orderForm.value.pickupCommuneId,
        address: this.orderForm.value.pickupDetailAddress,
        lat: this.orderForm.value.pickupLat,
        lng: this.orderForm.value.pickupLng,
      },
      deliveryAddress: {
        provinceId: this.orderForm.value.deliveryProvinceId,
        communeId: this.orderForm.value.deliveryCommuneId,
        address: this.orderForm.value.deliveryDetailAddress,
        lat: this.orderForm.value.deliveryLat,
        lng: this.orderForm.value.deliveryLng,
      },
      codValue: Number(this.orderForm.value.codValue) || 0,
      weightKg: Number(this.orderForm.value.weightKg) || 1,
      serviceCode: this.orderForm.value.serviceCode || 'STD',
      details: this.orderForm.value.details?.trim() || null,
      shippingFeePayer: this.orderForm.value.shippingFeePayer,
      paymentMethod: this.orderForm.value.paymentMethod,
    };

    this.ordersService.createOrder(data).subscribe({
      next: (apiResponse: any) => {
        this.loading = false;
        const res = apiResponse?.data || apiResponse;
        this.clientRequestId = this.newClientRequestId();

        if (res.paymentAttempt) {
          this.paymentRecovery.remember(res.paymentAttempt);
          if (res.paymentAttempt.payUrl) {
            window.location.assign(res.paymentAttempt.payUrl);
            return;
          }
        }

        if (res.redirectUrl) {
          window.location.href = res.redirectUrl;
          return;
        }

        if (res.paymentError && res.paymentAttempt) {
          Swal.fire({
            icon: 'warning',
            title: 'Đơn đã tạo, thanh toán chưa bắt đầu',
            text: res.paymentError,
            confirmButtonText: 'Về danh sách',
          }).then(() => this.router.navigate(['/admin/orders/list']));
          return;
        }

        // Thanh toán thủ công
        Swal.fire({
          icon: 'success',
          title: 'Tạo đơn thành công!',
          text: `Mã vận đơn: ${res.order.waybill}`,
          confirmButtonText: 'Về danh sách',
        }).then(() => this.router.navigate(['/admin/orders/list']));
      },
      error: (err) => {
        this.loading = false;
        Swal.fire('Lỗi!', err.error?.message || 'Tạo đơn thất bại', 'error');
      },
    });
  }

  private newClientRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }
}
