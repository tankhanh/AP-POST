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

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private router: Router,
    private geocoding: GeocodingService,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();
  }

  ngAfterViewInit() {
    setTimeout(() => { // thêm setTimeout để Angular ổn định
      // Tìm kiếm địa chỉ
      this.orderForm.get('pickupDetailAddress')?.valueChanges
        .pipe(debounceTime(800))
        .subscribe(() => {
          if (this.shouldSearch('pickup')) this.updatePickupMap();
        });

      this.orderForm.get('deliveryDetailAddress')?.valueChanges
        .pipe(debounceTime(800))
        .subscribe(() => {
          if (this.shouldSearch('delivery')) this.updateDeliveryMap();
        });

      merge(
        this.orderForm.get('pickupProvinceId')!.valueChanges.pipe(startWith(this.orderForm.value.pickupProvinceId)),
        this.orderForm.get('deliveryProvinceId')!.valueChanges.pipe(startWith(this.orderForm.value.deliveryProvinceId)),
        this.orderForm.get('weightKg')!.valueChanges.pipe(startWith(this.orderForm.value.weightKg)),
        this.orderForm.get('serviceCode')!.valueChanges.pipe(startWith(this.orderForm.value.serviceCode))
      )
        .pipe(debounceTime(600))
        .subscribe(() => {
          this.calculateShippingFee();
        });

      // Cập nhật tổng khi gõ COD
      this.orderForm.get('codValue')?.valueChanges
        .pipe(debounceTime(300))
        .subscribe(() => this.updateTotalPrice());

      // Tính phí lần đầu
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

  updatePickupMap() {
    const f = this.orderForm.value;
    if (!f.pickupDetailAddress && !f.pickupDetailAddress) return;

    // Ưu tiên 1: Dùng địa chỉ chi tiết + phường + tỉnh (rút gọn)
    let searchQuery = [
      f.pickupDetailAddress?.trim(),
      this.getCommuneName(f.pickupCommuneId),
      this.getProvinceName(f.pickupProvinceId)
    ].filter(Boolean).join(', ');

    // Nếu vẫn trống thì dùng ít nhất tỉnh + phường
    if (!searchQuery.trim()) {
      searchQuery = `${this.getCommuneName(f.pickupCommuneId)} ${this.getProvinceName(f.pickupProvinceId)}`;
    }

    // Thêm Việt Nam để tăng độ chính xác
    searchQuery = searchQuery + ', Việt Nam';

    console.log('Pickup search:', searchQuery);

    this.geocoding.search(searchQuery).subscribe(res => {
      if (res?.length > 0) {
        const lat = parseFloat(res[0].lat);
        const lng = parseFloat(res[0].lon);
        this.orderForm.patchValue({
          pickupLat: lat,
          pickupLng: lng
        });
        console.log('Pickup OK:', lat, lng);
      } else {
        // Fallback cuối cùng: chỉ dùng tỉnh
        const fallback = `${this.getProvinceName(f.pickupProvinceId)}, Việt Nam`;
        this.geocoding.search(fallback).subscribe(res2 => {
          if (res2?.length > 0) {
            this.orderForm.patchValue({
              pickupLat: parseFloat(res2[0].lat),
              pickupLng: parseFloat(res2[0].lon)
            });
          }
        });
      }
    });
  }

  updateDeliveryMap() {
    const f = this.orderForm.value;
    if (!f.deliveryDetailAddress) return;

    let searchQuery = [
      f.deliveryDetailAddress.trim(),
      this.getCommuneName(f.deliveryCommuneId),
      this.getProvinceName(f.deliveryProvinceId)
    ].filter(Boolean).join(', ');

    if (!searchQuery.trim()) {
      searchQuery = `${this.getCommuneName(f.deliveryCommuneId)} ${this.getProvinceName(f.deliveryProvinceId)}`;
    }

    searchQuery += ', Việt Nam';

    console.log('Delivery search:', searchQuery);

    this.geocoding.search(searchQuery).subscribe(res => {
      if (res?.length > 0) {
        this.orderForm.patchValue({
          deliveryLat: parseFloat(res[0].lat),
          deliveryLng: parseFloat(res[0].lon)
        });
      } else {
        // Fallback
        const fallback = `${this.getProvinceName(f.deliveryProvinceId)}, Việt Nam`;
        this.geocoding.search(fallback).subscribe(res2 => {
          if (res2?.length > 0) {
            this.orderForm.patchValue({
              deliveryLat: parseFloat(res2[0].lat),
              deliveryLng: parseFloat(res2[0].lon)
            });
          }
        });
      }
    });
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

  private updateTotalPrice() {
    const cod = Number(this.orderForm.value.codValue || 0);
    this.totalPrice = this.shippingFee + cod;
  }

  async calculateShippingFee() {
    const f = this.orderForm.value;

    if (!f.pickupProvinceId || !f.deliveryProvinceId || !f.weightKg) {
      this.shippingFee = 0;
      this.updateTotalPrice();
      return;
    }

    const originProv = this.provinces.find(p => p._id === f.pickupProvinceId);
    const destProv = this.provinces.find(p => p._id === f.deliveryProvinceId);

    if (!originProv?.code || !destProv?.code) {
      this.shippingFee = 0;
      this.updateTotalPrice();
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
      this.updateTotalPrice(); // Đảm bảo tổng tiền luôn đúng dù có lỗi hay không
    }
  }

  getStraightDistance(): number {
    const f = this.orderForm.value;
    if (!f.pickupLat || !f.deliveryLat) return 0;

    const R = 6371; // Bán kính Trái Đất (km)
    const dLat = (f.deliveryLat - f.pickupLat) * Math.PI / 180;
    const dLon = (f.deliveryLng - f.pickupLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(f.pickupLat * Math.PI / 180) * Math.cos(f.deliveryLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
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

  submit() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    const f = this.orderForm.value;

    const data = {
      senderName: f.senderName,
      receiverName: f.receiverName,
      receiverPhone: f.receiverPhone,
      email: f.email?.trim() || null,
      pickupAddress: {
        provinceId: f.pickupProvinceId,
        communeId: f.pickupCommuneId,
        address: f.pickupDetailAddress,
        lat: f.pickupLat,
        lng: f.pickupLng,
      },
      deliveryAddress: {
        provinceId: f.deliveryProvinceId,
        communeId: f.deliveryCommuneId,
        address: f.deliveryDetailAddress,
        lat: f.deliveryLat,
        lng: f.deliveryLng,
      },
      codValue: Number(f.codValue) || 0,
      weightKg: Number(f.weightKg) || 1,
      serviceCode: f.serviceCode || 'STD',

      details: f.details?.trim() || null,
    };

    this.ordersService.createOrder(data).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.createdWaybill = res.data?.waybill || res.data?._id;

        Swal.fire({
          icon: 'success',
          title: 'Tạo đơn thành công!',
          // 1. Thêm nút tắt ở góc trên bên phải
          showCloseButton: true,
          html: `
          <div class="text-center">
          <p class="mb-3 fs-5">Mã vận đơn của bạn là:</p>
          <h2 class="display-5 fw-bold text-secondary mb-4">${this.createdWaybill}</h2>
          <p class="text-muted mt-4 small">
          Khách hàng có thể tra cứu tại: <strong>yourdomain.com/tracking</strong>
          </p>
          </div>
            `,
          allowOutsideClick: false,
          showConfirmButton: true,
          confirmButtonText: 'Tạo đơn mới',
          // Xóa didOpen vì không còn các nút cần xử lý sự kiện
        }).then((result) => {
          if (result.isConfirmed) {
            this.orderForm.reset();
            this.orderForm.patchValue({ serviceCode: 'STD', weightKg: 1, codValue: 0 });
            this.pickupCommunes = [];
            this.deliveryCommunes = [];
            this.shippingFee = 0;
            this.totalPrice = 0;
            this.createdWaybill = '';
          }
        });
      },
      error: (err) => {
        this.loading = false;
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
