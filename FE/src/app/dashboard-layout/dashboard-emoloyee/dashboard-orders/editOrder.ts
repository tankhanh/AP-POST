import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OrdersService } from '../../../services/dashboard/orders.service';
import { LocationService } from '../../../services/location.service';
import { GeocodingService } from '../../../services/geocoding.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { MapPickerComponent } from '../../../shared/map-picker/map-picker';

@Component({
  selector: 'app-edit-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MapPickerComponent, RouterModule],
  templateUrl: './editOrder.html',
})
export class EditOrder implements OnInit {
  @ViewChild('pickupMap') pickupMap!: MapPickerComponent;
  @ViewChild('deliveryMap') deliveryMap!: MapPickerComponent;

  orderForm!: FormGroup;
  order: any = null;
  orderId: string = '';
  loading = false;

  provinces: any[] = [];
  pickupCommunes: any[] = [];
  deliveryCommunes: any[] = [];

  currentShippingFee = 0;
  recalculated = false;

  isPricingLocked = false;
  pricingNote = '';
  originalShippingFee = 0;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    public router: Router,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private geocoding: GeocodingService
  ) {
    this.createForm();
  }

  ngOnInit(): void {
    this.orderId = this.route.snapshot.params['id'];
    if (!this.orderId) {
      Swal.fire('Lỗi', 'Không tìm thấy ID đơn hàng', 'error');
      this.router.navigate(['/employee/order/list']);
      return;
    }

    this.loadProvinces();
    this.loadOrderDetail();

    // Thay đổi lớn ở đây: debounce + điều kiện
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

    // this.orderForm.valueChanges.pipe(debounceTime(600)).subscribe(() => {
    //   if (this.order?.status === 'CONFIRMED') this.recalculateIfAllowed();
    // });
  }

  // Thêm hàm này vào class
  private shouldSearch(type: 'pickup' | 'delivery'): boolean {
    const f = this.orderForm.value;
    const detail = type === 'pickup' ? f.pickupDetailAddress : f.deliveryDetailAddress;
    const provinceId = type === 'pickup' ? f.pickupProvinceId : f.deliveryProvinceId;
    const communeId = type === 'pickup' ? f.pickupCommuneId : f.deliveryCommuneId;
    return !!(detail && detail.trim().length >= 3 && provinceId && communeId);
  }

  // Sửa 2 hàm update map
  updatePickupMap() {
    const f = this.orderForm.value;
    if (!f.pickupDetailAddress || !f.pickupProvinceId || !f.pickupCommuneId) return;

    const fullAddress = `${this.getCommuneName(f.pickupCommuneId)}, ${this.getProvinceName(
      f.pickupProvinceId
    )}, ${f.pickupDetailAddress}`;
    console.log('📍 Pickup full address:', fullAddress); // Debug

    this.geocoding.search(fullAddress).subscribe((res) => {
      console.log('📍 Pickup result:', res); // Debug
      if (!res || res.length === 0) {
        console.warn('⚠️ No pickup location found');
        return;
      }

      const lat = parseFloat(res[0].lat);
      const lng = parseFloat(res[0].lon);
      console.log(`✅ Setting pickup marker at ${lat}, ${lng}`);

      this.orderForm.patchValue({ pickupLat: lat, pickupLng: lng });
      if (this.pickupMap) {
        this.pickupMap.setMarker(lat, lng);
      }
    });
  }

  updateDeliveryMap() {
    const f = this.orderForm.value;
    if (!f.deliveryDetailAddress || !f.deliveryProvinceId || !f.deliveryCommuneId) return;

    const fullAddress = `${this.getCommuneName(f.deliveryCommuneId)}, ${this.getProvinceName(
      f.deliveryProvinceId
    )}, ${f.deliveryDetailAddress}`;
    console.log('📍 Delivery full address:', fullAddress); // Debug

    this.geocoding.search(fullAddress).subscribe((res) => {
      console.log('📍 Delivery result:', res); // Debug
      if (!res || res.length === 0) {
        console.warn('⚠️ No delivery location found');
        return;
      }

      const lat = parseFloat(res[0].lat);
      const lng = parseFloat(res[0].lon);
      console.log(`✅ Setting delivery marker at ${lat}, ${lng}`);

      this.orderForm.patchValue({ deliveryLat: lat, deliveryLng: lng });
      if (this.deliveryMap) {
        this.deliveryMap.setMarker(lat, lng);
      }
    });
  }

  createForm() {
    this.orderForm = this.fb.group({
      senderName: ['', Validators.required],
      receiverName: ['', Validators.required],
      receiverPhone: ['', [Validators.required, Validators.pattern('^[0-9]{9,11}$')]],

      pickupProvinceId: ['', Validators.required],
      pickupCommuneId: ['', Validators.required],
      pickupDetailAddress: ['', Validators.required],
      pickupLat: [''],
      pickupLng: [''],

      deliveryProvinceId: ['', Validators.required],
      deliveryCommuneId: ['', Validators.required],
      deliveryDetailAddress: ['', Validators.required],
      deliveryLat: [''],
      deliveryLng: [''],

      serviceCode: ['STD'],
      weightKg: [1, [Validators.required, Validators.min(0.01)]],

      status: ['PENDING'],

      details: ['']
    });
  }

  orderStatusOptions = [
    { value: 'PENDING', label: 'Chờ xác nhận' },
    { value: 'CONFIRMED', label: 'Đã xác nhận' },
    { value: 'SHIPPING', label: 'Đang giao' },
    { value: 'COMPLETED', label: 'Hoàn tất' },
    { value: 'CANCELED', label: 'Đã hủy' },
  ];

  loadProvinces() {
    this.locationService.getProvinces().subscribe((res) => {
      this.provinces = res.data || [];
    });
  }

  loadOrderDetail() {
    this.ordersService.getOrderById(this.orderId).subscribe((res) => {
      this.order = res.data;

      this.isPricingLocked = !!this.order.pricingLocked;
      this.pricingNote = this.order.pricingNote || '';
      this.originalShippingFee = this.order.shippingFee || 0;

      this.currentShippingFee = this.isPricingLocked
        ? this.originalShippingFee
        : this.order.shippingFee;

      this.orderForm.patchValue({
        senderName: this.order.senderName,
        receiverName: this.order.receiverName,
        receiverPhone: this.order.receiverPhone,

        pickupProvinceId: this.order.pickupAddressId?.provinceId?._id || '',
        pickupCommuneId: this.order.pickupAddressId?.communeId?._id || '',
        pickupDetailAddress: this.order.pickupAddressId?.address || '',
        pickupLat: this.order.pickupAddressId?.lat || null,
        pickupLng: this.order.pickupAddressId?.lng || null,

        deliveryProvinceId: this.order.deliveryAddressId?.provinceId?._id || '',
        deliveryCommuneId: this.order.deliveryAddressId?.communeId?._id || '',
        deliveryDetailAddress: this.order.deliveryAddressId?.address || '',
        deliveryLat: this.order.deliveryAddressId?.lat || null,
        deliveryLng: this.order.deliveryAddressId?.lng || null,

        serviceCode: this.order.serviceCode || 'STD',
        weightKg: this.order.weightKg || 1,
        status: this.order.status,

        details: this.order.details || '',
      });

      // Set marker map sau khi patchValue xong
      setTimeout(() => {
        if (this.pickupMap && this.orderForm.value.pickupLat && this.orderForm.value.pickupLng) {
          this.pickupMap.setMarker(this.orderForm.value.pickupLat, this.orderForm.value.pickupLng);
        }
        if (
          this.deliveryMap &&
          this.orderForm.value.deliveryLat &&
          this.orderForm.value.deliveryLng
        ) {
          this.deliveryMap.setMarker(
            this.orderForm.value.deliveryLat,
            this.orderForm.value.deliveryLng
          );
        }
      }, 100);

      this.onPickupProvinceChange(false);
      this.onDeliveryProvinceChange(false);
    });
  }

  // ================== QUYỀN SỬA THEO TRẠNG THÁI ==================
  canEditSender() {
    return this.order?.status === 'PENDING';
  }
  canEditReceiver() {
    return ['PENDING', 'CONFIRMED'].includes(this.order?.status);
  }
  canEditPhone() {
    return ['PENDING', 'CONFIRMED', 'SHIPPING'].includes(this.order?.status);
  }
  canEditPickupAddress() {
    return this.order?.status === 'PENDING';
  }
  canEditDeliveryAddress() {
    return ['PENDING', 'CONFIRMED', 'SHIPPING'].includes(this.order?.status);
  }
  canSubmit() {
    return ['PENDING', 'CONFIRMED', 'SHIPPING'].includes(this.order?.status);
  }
  canEditStatus() {
    return ['PENDING', 'CONFIRMED', 'SHIPPING'].includes(this.order?.status);
  }
  canEditService() {
    return ['PENDING', 'CONFIRMED'].includes(this.order?.status);
  }

  statusText(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'Chờ xác nhận',
      CONFIRMED: 'Đã xác nhận',
      SHIPPING: 'Đang giao',
      COMPLETED: 'Hoàn tất',
      CANCELED: 'Đã hủy',
    };
    return map[status] || status;
  }

  // ================== TÍNH PHÍ ==================
  async recalculateIfAllowed() {
    if (this.isPricingLocked) {
      Swal.fire({
        icon: 'warning',
        title: 'Không thể thay đổi phí vận chuyển!',
        text: 'Phí đã được cố định từ lúc khách đặt hàng. Chỉ Admin mới có thể mở khóa (nếu cần).',
        timer: 5000,
        toast: true,
        position: 'top-end'
      });
      return; // DỪNG LUÔN – không tính gì nữa
    }

    const f = this.orderForm.value;
    if (!f.pickupProvinceId || !f.deliveryProvinceId) return;

    const origin = this.provinces.find((p) => p._id === f.pickupProvinceId);
    const dest = this.provinces.find((p) => p._id === f.deliveryProvinceId);
    if (!origin?.code || !dest?.code) return;

    try {
      const res: any = await firstValueFrom(
        this.ordersService.calculateShippingFee({
          originProvinceCode: origin.code,
          destProvinceCode: dest.code,
          serviceCode: f.serviceCode || 'STD',
          weightKg: Number(f.weightKg) || 1,
          isLocal: f.pickupProvinceId === f.deliveryProvinceId,
        })
      );
      this.currentShippingFee = res.data?.totalPrice || 0;
      this.recalculated = true;
    } catch (err) {
      console.warn('Tính phí lỗi:', err);
    }
  }

  onWeightOrServiceChange() {
  if (this.canEditService()) {
    this.recalculateIfAllowed();
  }
}

  // ================== MAP & LOCATION ==================
  onPickupProvinceChange(reset = true) {
    const id = this.orderForm.get('pickupProvinceId')?.value;
    if (!id) {
      this.pickupCommunes = [];
      return;
    }
    this.locationService.getCommunes(id).subscribe((res) => {
      this.pickupCommunes = res.data || [];
      if (reset) this.orderForm.get('pickupCommuneId')?.setValue('');
    });
  }

  onDeliveryProvinceChange(reset = true) {
    const id = this.orderForm.get('deliveryProvinceId')?.value;
    if (!id) {
      this.deliveryCommunes = [];
      return;
    }
    this.locationService.getCommunes(id).subscribe((res) => {
      this.deliveryCommunes = res.data || [];
      if (reset) this.orderForm.get('deliveryCommuneId')?.setValue('');
    });
    if (reset !== false) {
      this.recalculateIfAllowed();
    }
    // if (this.order?.status === 'CONFIRMED') this.recalculateIfAllowed();
  }

  setPickupLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ pickupLat: pos.lat, pickupLng: pos.lng });
  }

  setDeliveryLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ deliveryLat: pos.lat, deliveryLng: pos.lng });
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

  resendWelcomeEmail() {
    if (!this.orderId || !this.order.email) {
      Swal.fire('Lỗi', 'Không tìm thấy ID đơn hàng hoặc email người nhận.', 'warning');
      return;
    }

    Swal.fire({
      title: 'Xác nhận gửi lại Email?',
      text: `Gửi lại email chào mừng/thông báo cho ${this.order.email}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Gửi lại',
      cancelButtonText: 'Hủy',
    }).then((result) => {
      if (result.isConfirmed) {
        // Thực hiện cuộc gọi API để gửi lại email
        this.ordersService.resendWelcomeEmail(this.orderId).subscribe({
          next: () => {
            Swal.fire('Thành công!', 'Email thông báo đã được gửi lại.', 'success');
          },
          error: (err) => {
            console.error('Lỗi gửi lại email:', err);
            Swal.fire('Lỗi!', err.error?.message || 'Không thể gửi lại email thông báo.', 'error');
          },
        });
      }
    });
  }

  // ================== SUBMIT ==================
  submit() {
    if (this.orderForm.invalid || !this.canSubmit()) {
      this.orderForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    const f = this.orderForm.value;
    const payload: any = {
      senderName: f.senderName,
      receiverName: f.receiverName,
      receiverPhone: f.receiverPhone,
      serviceCode: f.serviceCode,
      weightKg: Number(f.weightKg),
      status: f.status,
      pickupAddress: {
        provinceId: f.pickupProvinceId,
        communeId: f.pickupCommuneId,
        address: f.pickupDetailAddress,
        lat: f.pickupLat || null,
        lng: f.pickupLng || null,
      },
      deliveryAddress: {
        provinceId: f.deliveryProvinceId,
        communeId: f.deliveryCommuneId,
        address: f.deliveryDetailAddress,
        lat: f.deliveryLat || null,
        lng: f.deliveryLng || null,
      },
      details: f.details?.trim() || null,
    };

    if (this.canEditSender()) payload.senderName = f.senderName;
    if (this.canEditReceiver()) payload.receiverName = f.receiverName;
    if (this.canEditPhone()) payload.receiverPhone = f.receiverPhone;
    if (this.canEditService()) {
      payload.serviceCode = f.serviceCode;
      payload.weightKg = Number(f.weightKg);
    }
    payload.status = f.status;

    if (this.canEditPickupAddress()) {
      payload.pickupAddress = {
        provinceId: f.pickupProvinceId,
        communeId: f.pickupCommuneId,
        address: f.pickupDetailAddress,
        lat: f.pickupLat || null,
        lng: f.pickupLng || null,
      };
    }

    if (this.canEditDeliveryAddress()) {
      payload.deliveryAddress = {
        provinceId: f.deliveryProvinceId,
        communeId: f.deliveryCommuneId,
        address: f.deliveryDetailAddress,
        lat: f.deliveryLat || null,
        lng: f.deliveryLng || null,
      };
    }

    this.ordersService.updateOrder(this.orderId, payload).subscribe({
      next: () => {
        Swal.fire('Thành công!', 'Cập nhật đơn hàng thành công', 'success');
        this.router.navigate(['/employee/order/list']);
      },
      error: (err) => {
        Swal.fire('Lỗi!', err.error?.message || 'Cập nhật thất bại', 'error');
        this.loading = false;
      },
    });
  }

  // ================== KHÔI PHỤC ĐƠN HỦY ==================
  restoreOrder() {
    Swal.fire({
      title: 'Khôi phục đơn hàng?',
      text: 'Đơn sẽ trở về trạng thái "Chờ xác nhận"',
      icon: 'question',
      showCancelButton: true,
    }).then((result) => {
      if (result.isConfirmed) {
        this.ordersService.updateStatus(this.orderId, 'PENDING').subscribe(() => {
          Swal.fire('Thành công!', 'Đơn hàng đã được khôi phục', 'success');
          location.reload();
        });
      }
    });
  }

  copyWaybill() {
    const waybill = this.order.waybill || this.order._id;
    navigator.clipboard.writeText(waybill);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Đã sao chép mã vận đơn!',
      timer: 2000,
      showConfirmButton: false,
    });
  }

  printLabel() {
    const waybill = this.order.waybill || this.order._id;
    window.open(`/print-label/${waybill}`, '_blank');
  }
}
