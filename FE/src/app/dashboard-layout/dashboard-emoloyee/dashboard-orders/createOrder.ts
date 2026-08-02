import { Component, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { OrdersService } from '../../../services/dashboard/orders.service';
import { LocationService } from '../../../services/location.service';
import { Router, RouterModule } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import { GeocodingService } from '../../../services/geocoding.service';
import { debounceTime } from 'rxjs/operators';
import { firstValueFrom, merge, startWith } from 'rxjs';
import { DualMapComponent } from '../../../shared/app-dual-map/app-dual-map';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PaymentRecoveryService } from '../../../services/payment-recovery.service';
import { CurrencyInputDirective } from '../../../shared/currency-input.directive';

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, DualMapComponent, CurrencyInputDirective],
  templateUrl: './createOrder.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CreateOrder implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  orderForm!: FormGroup;
  loading = false;
  provinces: any[] = [];
  pickupCommunes: any[] = [];
  deliveryCommunes: any[] = [];
  shippingFee = 0;
  senderPay = 0;
  receiverPay = 0;
  paymentNote = '';
  isPublicFlow = false;
  pageTitle = 'Tạo đơn hàng mới';
  submitLabel = 'Tạo đơn hàng';
  publicOtpToken = '';
  otpCode = '';
  requestingOtp = false;
  verifyingOtp = false;
  otpVerified = false;
  provincesLoading = false;
  provincesError = '';
  private verifiedContact = '';
  private clientRequestId = this.newClientRequestId();

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private router: Router,
    private geocoding: GeocodingService,
    private route: ActivatedRoute,
    private paymentRecovery: PaymentRecoveryService,
  ) {}

  ngOnInit(): void {
    this.isPublicFlow = this.route.snapshot.data['publicCreate'] === true;
    if (this.isPublicFlow) {
      this.pageTitle = 'Tạo đơn gửi hàng (B2C)';
      this.submitLabel = 'Tạo đơn gửi';
    }
    this.initForm();
    if (this.isPublicFlow) {
      this.orderForm
        .get('senderPhone')
        ?.setValidators([Validators.required, Validators.pattern('^[0-9]{9,11}$')]);
      this.orderForm
        .get('email')
        ?.setValidators([Validators.required, Validators.email, Validators.maxLength(254)]);
      this.orderForm.get('senderPhone')?.updateValueAndValidity();
      this.orderForm.get('email')?.updateValueAndValidity();
    }
    this.bindFormChanges();
    this.loadProvinces();
  }

  private bindFormChanges(): void {
    this.orderForm
      .get('pickupProvinceId')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.autoUpdatePickup());
    this.orderForm
      .get('pickupCommuneId')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.autoUpdatePickup());
    this.orderForm
      .get('pickupDetailAddress')
      ?.valueChanges.pipe(debounceTime(800), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.autoUpdatePickup());

    this.orderForm
      .get('deliveryProvinceId')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.autoUpdateDelivery());
    this.orderForm
      .get('deliveryCommuneId')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.autoUpdateDelivery());
    this.orderForm
      .get('deliveryDetailAddress')
      ?.valueChanges.pipe(debounceTime(800), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.autoUpdateDelivery());

    merge(
      this.orderForm.get('pickupProvinceId')!.valueChanges,
      this.orderForm.get('deliveryProvinceId')!.valueChanges,
      this.orderForm.get('weightKg')!.valueChanges,
      this.orderForm.get('serviceCode')!.valueChanges,
      this.orderForm.get('codValue')!.valueChanges,
      this.orderForm.get('shippingFeePayer')!.valueChanges.pipe(startWith('SENDER')),
      this.orderForm.get('paymentMethod')!.valueChanges.pipe(startWith('CASH')),
    )
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.calculateShippingFee());

    if (this.isPublicFlow) {
      merge(
        this.orderForm.get('senderPhone')!.valueChanges,
        this.orderForm.get('email')!.valueChanges,
      )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          const contact = this.currentOtpContact();
          if (this.verifiedContact && contact !== this.verifiedContact) {
            this.otpVerified = false;
            this.publicOtpToken = '';
            this.verifiedContact = '';
          }
        });
    }

    this.calculateShippingFee();
    this.updatePayments();
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
      senderPhone: [''],
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
      pickupMethod: ['DROPOFF'],
      pickupSlot: [''],
    });
  }

  requestOtp() {
    if (!this.isPublicFlow) return;
    const senderPhone = (this.orderForm.value.senderPhone || '').trim();
    const email = (this.orderForm.value.email || '').trim().toLowerCase();
    if (!senderPhone || !email || this.orderForm.get('email')?.invalid) {
      Swal.fire(
        'Thiếu thông tin',
        'Vui lòng nhập số điện thoại và email hợp lệ để nhận OTP',
        'warning',
      );
      return;
    }

    this.requestingOtp = true;
    this.ordersService.requestPublicOtp(senderPhone, email).subscribe({
      next: (res: any) => {
        this.requestingOtp = false;
        const data = res?.data || res;
        this.publicOtpToken = data.otpToken || '';
        if (data.devOtpCode) this.otpCode = data.devOtpCode;
        this.otpVerified = false;
        this.verifiedContact = '';
        Swal.fire(
          'OTP đã gửi',
          data.devOtpCode ? `Mã OTP dev: ${data.devOtpCode}` : data.message,
          'success',
        );
      },
      error: (err) => {
        this.requestingOtp = false;
        Swal.fire('Lỗi!', err.error?.message || 'Không thể gửi OTP', 'error');
      },
    });
  }

  verifyOtp() {
    if (!this.isPublicFlow) return;
    const senderPhone = (this.orderForm.value.senderPhone || '').trim();
    const email = (this.orderForm.value.email || '').trim().toLowerCase();
    const code = (this.otpCode || '').trim();
    if (!senderPhone || !email || !code || !this.publicOtpToken) {
      Swal.fire('Thiếu thông tin', 'Bạn cần gửi OTP và nhập mã xác thực', 'warning');
      return;
    }

    this.verifyingOtp = true;
    this.ordersService.verifyPublicOtp(senderPhone, email, code).subscribe({
      next: (res: any) => {
        this.verifyingOtp = false;
        const data = res?.data || res;
        this.publicOtpToken = data.otpToken || this.publicOtpToken;
        this.otpVerified = true;
        this.verifiedContact = this.currentOtpContact();
        Swal.fire('Thành công', 'Email liên hệ đã được xác thực', 'success');
      },
      error: (err) => {
        this.verifyingOtp = false;
        this.otpVerified = false;
        Swal.fire('Lỗi!', err.error?.message || 'Xác thực OTP thất bại', 'error');
      },
    });
  }

  loadProvinces() {
    this.provincesLoading = true;
    this.provincesError = '';
    this.locationService.getProvinces().subscribe({
      next: (res) => {
        this.provinces = res.data || [];
        this.provincesLoading = false;
      },
      error: () => {
        this.provincesLoading = false;
        this.provincesError = 'Không thể tải địa danh. Vui lòng thử lại.';
      },
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
      senderPhone: this.orderForm.value.senderPhone?.trim() || null,
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
      pickupMethod: this.orderForm.value.pickupMethod,
      pickupSlot: this.orderForm.value.pickupSlot || null,
      publicOtpToken: this.isPublicFlow ? this.publicOtpToken : undefined,
    };

    if (this.isPublicFlow && !this.otpVerified) {
      this.loading = false;
      Swal.fire(
        'Chưa xác thực OTP',
        'Vui lòng xác thực số điện thoại trước khi tạo đơn',
        'warning',
      );
      return;
    }

    const request$ = this.isPublicFlow
      ? this.ordersService.createPublicOrder(data)
      : this.ordersService.createOrder(data);

    request$.subscribe({
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
            confirmButtonText: this.isPublicFlow ? 'Tra cứu đơn' : 'Về danh sách',
          }).then(() => {
            if (this.isPublicFlow) {
              this.router.navigate(['/tracking'], { queryParams: { q: res.order.waybill } });
            } else {
              this.router.navigate(['/employee/orders/list']);
            }
          });
          return;
        }

        // Thanh toán thủ công
        Swal.fire({
          icon: 'success',
          title: this.isPublicFlow ? 'Tạo đơn B2C thành công!' : 'Tạo đơn thành công!',
          text: `Mã vận đơn: ${res.order.waybill}`,
          confirmButtonText: this.isPublicFlow ? 'Tra cứu đơn' : 'Về danh sách',
        }).then(() => {
          if (this.isPublicFlow) {
            this.router.navigate(['/tracking'], { queryParams: { q: res.order.waybill } });
          } else {
            this.router.navigate([this.ordersListLink]);
          }
        });
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

  private currentOtpContact(): string {
    const phone = String(this.orderForm.value.senderPhone || '').replace(/\s+/g, '');
    const email = String(this.orderForm.value.email || '')
      .trim()
      .toLowerCase();
    return `${phone}|${email}`;
  }

  get ordersListLink(): string {
    return this.router.url.startsWith('/customer/')
      ? '/customer/orders/list'
      : '/employee/orders/list';
  }
}
