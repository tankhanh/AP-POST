import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OrdersService } from '../../../services/dashboard/orders.service';
import { LocationService } from '../../../services/location.service';
import { Router, RouterLink, RouterModule } from '@angular/router';
import Swal from 'sweetalert2';
import { GeocodingService } from '../../../services/geocoding.service';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { firstValueFrom, merge } from 'rxjs';
import { DualMapComponent } from '../../../shared/app-dual-map/app-dual-map';

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DualMapComponent],
  templateUrl: './createOrder.html',
})
export class CreateOrder implements OnInit, AfterViewInit {
  orderForm!: FormGroup;
  loading = false;

  provinces: any[] = [];
  pickupCommunes: any[] = [];
  deliveryCommunes: any[] = [];

  shippingFee = 0;
  totalPrice = 0;

  createdWaybill: string = '';

  routeDistance = 0;
  routeTime = 0;

  senderPay = 0;
  receiverPay = 0;

  paymentNote = '';

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private router: Router,
    private geocoding: GeocodingService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      // Geocoding khi gõ địa chỉ
      this.orderForm
        .get('pickupDetailAddress')
        ?.valueChanges.pipe(debounceTime(800))
        .subscribe(() => {
          if (this.shouldSearch('pickup')) this.updatePickupMap();
        });

      this.orderForm
        .get('deliveryDetailAddress')
        ?.valueChanges.pipe(debounceTime(800))
        .subscribe(() => {
          if (this.shouldSearch('delivery')) this.updateDeliveryMap();
        });

      // Tự động tính lại phí + tiền khi thay đổi các field quan trọng
      merge(
        this.orderForm.get('pickupProvinceId')!.valueChanges,
        this.orderForm.get('deliveryProvinceId')!.valueChanges,
        this.orderForm.get('weightKg')!.valueChanges,
        this.orderForm.get('serviceCode')!.valueChanges,
        this.orderForm.get('codValue')!.valueChanges,
        this.orderForm.get('shippingFeePayer')!.valueChanges.pipe(startWith('SENDER'))
      )
        .pipe(debounceTime(300))
        .subscribe(() => {
          this.calculateShippingFee(); // → sẽ gọi updatePayments() bên trong
        });

      // Tính lần đầu
      this.calculateShippingFee();
    }, 100);
  }

  // Hàm kiểm tra đủ điều kiện để search (tránh gọi thừa)
  private shouldSearch(type: 'pickup' | 'delivery'): boolean {
    const f = this.orderForm.value;
    const detail = type === 'pickup' ? f.pickupDetailAddress : f.deliveryDetailAddress;
    const provinceId = type === 'pickup' ? f.pickupProvinceId : f.deliveryProvinceId;
    const communeId = type === 'pickup' ? f.pickupCommuneId : f.deliveryCommuneId;

    const canSearch = !!(
      detail &&
      detail.trim().length >= 3 && // Giảm từ 6 xuống 3
      provinceId &&
      communeId
    );

    if (canSearch) {
      console.log(`✅ Can search ${type}: "${detail}"`); // Debug
    }
    return canSearch;
  }

  initForm() {
    this.orderForm = this.fb.group({
      senderName: ['', Validators.required],
      receiverName: ['', Validators.required],
      receiverPhone: ['', [Validators.required, Validators.pattern('^[0-9]{9,11}$')]],
      pickupProvinceId: ['', Validators.required],
      pickupCommuneId: ['', Validators.required],
      pickupDetailAddress: ['', Validators.required],
      deliveryProvinceId: ['', Validators.required],
      deliveryCommuneId: ['', Validators.required],
      deliveryDetailAddress: ['', Validators.required],

      serviceCode: ['STD'],
      weightKg: [1, [Validators.required, Validators.min(0.01)]],
      codValue: [0, [Validators.required, Validators.min(0)]],

      email: [''],

      details: [''],
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
    const provinceId = this.orderForm.get('pickupProvinceId')?.value;
    if (!provinceId) {
      this.pickupCommunes = [];
      return;
    }
    this.locationService.getCommunes(provinceId).subscribe({
      next: (res) => {
        this.pickupCommunes = res.data || [];
        this.orderForm.get('pickupCommuneId')?.setValue('');

        this.orderForm.get('pickupCommuneId')?.valueChanges.subscribe(() => {
          if (this.orderForm.value.pickupDetailAddress) {
            this.updatePickupMap();
          }
        });
      },
      error: (err) => console.error(err),
    });
  }

  onDeliveryProvinceChange() {
    const provinceId = this.orderForm.get('deliveryProvinceId')?.value;
    if (!provinceId) {
      this.deliveryCommunes = [];
      return;
    }
    this.locationService.getCommunes(provinceId).subscribe({
      next: (res) => {
        this.deliveryCommunes = res.data || [];
        this.orderForm.get('deliveryCommuneId')?.setValue('');

        this.orderForm.get('deliveryCommuneId')?.valueChanges.subscribe(() => {
          if (this.orderForm.value.deliveryDetailAddress) {
            this.updateDeliveryMap();
          }
        });
      },
      error: (err) => console.error(err),
    });
  }

  setPickupLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ pickupLat: pos.lat, pickupLng: pos.lng });
  }

  setDeliveryLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ deliveryLat: pos.lat, deliveryLng: pos.lng });
  }

  async updatePickupMap() {
    const f = this.orderForm.value;
    if (!f.pickupProvinceId || !f.pickupCommuneId) return;

    const provinceName = this.getProvinceName(f.pickupProvinceId);
    const communeName = this.getCommuneName(f.pickupCommuneId);
    const detail = f.pickupDetailAddress?.trim();

    // CHIẾN LƯỢC MỚI: ƯU TIÊN TÌM THEO PHƯỜNG + TỈNH TRƯỚC
    const queries = [];

    if (detail) {
      queries.push(`${detail}, ${communeName}, ${provinceName}, Việt Nam`);
    }
    queries.push(`${communeName}, ${provinceName}, Việt Nam`);
    queries.push(`${provinceName}, Việt Nam`); // fallback cuối

    for (const q of queries) {
      const res = await firstValueFrom(this.geocoding.search(q));
      if (res?.length > 0) {
        const { lat, lon } = res[0];
        this.orderForm.patchValue({
          pickupLat: parseFloat(lat),
          pickupLng: parseFloat(lon),
        });
        console.log('Pickup geocoded:', q, '→', lat, lon);
        return; // Thoát ngay khi tìm thấy
      }
    }
  }

  async updateDeliveryMap() {
    const f = this.orderForm.value;
    if (!f.deliveryProvinceId || !f.deliveryCommuneId) return;

    const provinceName = this.getProvinceName(f.deliveryProvinceId);
    const communeName = this.getCommuneName(f.deliveryCommuneId);
    const detail = f.deliveryDetailAddress?.trim();

    const queries = [];

    if (detail) {
      queries.push(`${detail}, ${communeName}, ${provinceName}, Việt Nam`);
    }
    queries.push(`${communeName}, ${provinceName}, Việt Nam`);
    queries.push(`${provinceName}, Việt Nam`);

    for (const q of queries) {
      const res = await firstValueFrom(this.geocoding.search(q));
      if (res?.length > 0) {
        const { lat, lon } = res[0];
        this.orderForm.patchValue({
          deliveryLat: parseFloat(lat),
          deliveryLng: parseFloat(lon),
        });
        console.log('Delivery geocoded:', q, '→', lat, lon);
        return;
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
    const payer = this.orderForm.value.shippingFeePayer || 'SENDER';
    const method = this.orderForm.value.paymentMethod || 'CASH';

    if (method === 'CASH') {
      this.senderPay = this.shippingFee;
      this.receiverPay = cod;
    } else if (method === 'COD') {
      this.senderPay = 0;
      this.receiverPay = cod + this.shippingFee;
    } else if (['MOMO', 'FAKE', 'BANK_TRANSFER'].includes(method)) {
      this.senderPay = cod + this.shippingFee; // người gửi trả hết
      this.receiverPay = 0;
    }

    // Hiển thị thông báo
    this.paymentNote = {
      CASH: 'Người gửi trả phí ship tại quầy',
      COD: 'Người nhận trả COD + phí (nếu có)',
      FAKE: 'Thanh toán qua Fake Gateway (test)',
      BANK_TRANSFER: 'Chuyển khoản trước',
    }[method];
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
        })
      );

      this.shippingFee = res.data?.totalPrice ?? res.totalPrice ?? 0;
    } catch (err) {
      console.warn('Lỗi tính phí:', err);
      this.shippingFee = 0;
    } finally {
      this.updatePayments(); // Quan trọng: luôn cập nhật tiền
    }
  }

  getStraightDistance(): number {
    const f = this.orderForm.value;
    if (!f.pickupLat || !f.deliveryLat) return 0;

    const R = 6371; // Bán kính Trái Đất (km)
    const dLat = ((f.deliveryLat - f.pickupLat) * Math.PI) / 180;
    const dLon = ((f.deliveryLng - f.pickupLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((f.pickupLat * Math.PI) / 180) *
        Math.cos((f.deliveryLat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  onPickupMoved(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ pickupLat: pos.lat, pickupLng: pos.lng });
    this.calculateShippingFee(); // tính lại phí nếu cần
  }

  onDeliveryMoved(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ deliveryLat: pos.lat, deliveryLng: pos.lng });
    this.calculateShippingFee();
  }

  onLocationReverse(event: {
    type: 'pickup' | 'delivery';
    lat: number;
    lng: number;
    address?: string;
  }) {
    if (!event.address) return;

    // Tách địa chỉ chi tiết (bỏ phường, tỉnh)
    const addr = event.address;
    const lower = addr.toLowerCase();

    // Lấy tên phường và tỉnh hiện tại
    const currentCommune = this.getCommuneName(
      event.type === 'pickup'
        ? this.orderForm.value.pickupCommuneId
        : this.orderForm.value.deliveryCommuneId
    );
    const currentProvince = this.getProvinceName(
      event.type === 'pickup'
        ? this.orderForm.value.pickupProvinceId
        : this.orderForm.value.deliveryProvinceId
    );

    // Chỉ lấy phần trước phường/tỉnh
    let detailAddress = addr.split(currentCommune)[0] || addr.split(currentProvince)[0] || addr;

    // Làm sạch
    detailAddress = detailAddress
      .replace(/, Việt Nam.*$/i, '')
      .replace(/, Hồ Chí Minh.*$/i, '')
      .replace(/, TP\.?\s?HCM.*$/i, '')
      .trim();

    if (detailAddress.endsWith(',')) {
      detailAddress = detailAddress.slice(0, -1).trim();
    }

    // Cập nhật input địa chỉ chi tiết
    const controlName = event.type === 'pickup' ? 'pickupDetailAddress' : 'deliveryDetailAddress';
    this.orderForm.get(controlName)?.setValue(detailAddress || '');
  }

  submit() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    const data = {
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
    };

    this.ordersService.createOrder(data).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.createdWaybill = res.data?.waybill || res.waybill;

        const paymentMethod = this.orderForm.get('paymentMethod')?.value;

        if (paymentMethod === 'FAKE') {
          Swal.fire({
            icon: 'info',
            title: 'Đang xử lý thanh toán giả...',
            html: 'Vui lòng chờ 2-3 giây',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
          });

          this.ordersService.createFakePayment(res.data._id).subscribe({
            next: (fakeRes: any) => {
              Swal.close();
              if (fakeRes.message.includes('thành công')) {
                Swal.fire('Thành công!', fakeRes.message, 'success').then(() => {
                  this.router.navigate(['/orders']);
                });
              } else {
                Swal.fire('Thất bại', fakeRes.message, 'warning');
              }
            },
            error: () => {
              Swal.fire('Lỗi', 'Không thể xử lý thanh toán giả', 'error');
            },
          });
          return;
        } else {
          Swal.fire({
            icon: 'success',
            title: 'Tạo đơn thành công!',
            html: `
        <div class="text-center">
          <p class="mb-3 fs-5">Mã vận đơn của bạn là:</p>
          <h2 class="display-5 fw-bold text-secondary mb-4">${this.createdWaybill}</h2>
          <p class="text-muted mt-4 small">
            Khách hàng có thể tra cứu tại: <strong>yourdomain.com/tracking</strong>
          </p>
        </div>
      `,
            confirmButtonText: 'Tạo đơn mới',
          }).then(() => {
            this.orderForm.reset();
            this.orderForm.patchValue({
              serviceCode: 'STD',
              weightKg: 1,
              codValue: 0,
              paymentMethod: 'CASH',
            });
          });
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Tạo đơn thất bại:', err);
        Swal.fire('Lỗi!', err.error?.message || 'Không thể tạo đơn hàng', 'error');
      },
    });
  }

  copyWaybill() {
    if (!this.createdWaybill) return;

    navigator.clipboard.writeText(this.createdWaybill);

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Đã sao chép mã vận đơn!',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });
  }

  printLabel() {
    window.open(`/print-label/${this.createdWaybill}`, '_blank');
  }
}
