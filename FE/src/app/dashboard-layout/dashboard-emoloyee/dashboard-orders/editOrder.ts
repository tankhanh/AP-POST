import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OrdersService } from '../../../services/dashboard/orders.service';
import { LocationService } from '../../../services/location.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-edit-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './editOrder.html',
})
export class EditOrder implements OnInit {
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
  ) {
    this.createForm();
  }

  ngOnInit(): void {
    this.orderId = this.route.snapshot.params['id'];
    if (!this.orderId) {
      Swal.fire('Lỗi', 'Không tìm thấy ID đơn hàng', 'error');
      this.router.navigate(['/employee/orders/list']);
      return;
    }

    this.loadProvinces();
    this.loadOrderDetail();
  }

  createForm() {
    this.orderForm = this.fb.group({
      senderName: ['', Validators.required],
      receiverName: ['', Validators.required],
      receiverPhone: ['', [Validators.required, Validators.pattern('^[0-9]{9,11}$')]],
      email: [''], // ← Thêm trường email

      pickupProvinceId: ['', Validators.required],
      pickupCommuneId: ['', Validators.required],
      pickupDetailAddress: ['', Validators.required],

      deliveryProvinceId: ['', Validators.required],
      deliveryCommuneId: ['', Validators.required],
      deliveryDetailAddress: ['', Validators.required],

      serviceCode: ['STD'],
      weightKg: [1, [Validators.required, Validators.min(0.01)]],

      status: ['PENDING'],

      details: [''],
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
        email: this.order.email || '', // ← Load email

        pickupProvinceId: this.order.pickupAddressId?.provinceId?._id || '',
        pickupCommuneId: this.order.pickupAddressId?.communeId?._id || '',
        pickupDetailAddress: this.order.pickupAddressId?.address || '',

        deliveryProvinceId: this.order.deliveryAddressId?.provinceId?._id || '',
        deliveryCommuneId: this.order.deliveryAddressId?.communeId?._id || '',
        deliveryDetailAddress: this.order.deliveryAddressId?.address || '',

        serviceCode: this.order.serviceCode || 'STD',
        weightKg: this.order.weightKg || 1,
        status: this.order.status,

        details: this.order.details || '',
      });

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

  // ================== TÍNH PHÍ (nếu cần) ==================
  async recalculateIfAllowed() {
    if (this.isPricingLocked) return;

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
        }),
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

  // ================== PROVINCE & COMMUNE ==================
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

  // ================== GỬI LẠI EMAIL ==================
  resendWelcomeEmail() {
    if (!this.orderId || !this.orderForm.value.email) {
      Swal.fire('Lỗi', 'Không có email để gửi thông báo.', 'warning');
      return;
    }

    Swal.fire({
      title: 'Gửi lại email?',
      text: `Gửi thông báo đến ${this.orderForm.value.email}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Gửi',
    }).then((result) => {
      if (result.isConfirmed) {
        this.ordersService.resendWelcomeEmail(this.orderId).subscribe({
          next: () => Swal.fire('Thành công!', 'Email đã được gửi.', 'success'),
          error: () => Swal.fire('Lỗi', 'Không thể gửi email.', 'error'),
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
      email: f.email?.trim() || null, // ← Lưu email
      serviceCode: f.serviceCode,
      weightKg: Number(f.weightKg),
      status: f.status,
      details: f.details?.trim() || null,
    };

    if (this.canEditPickupAddress()) {
      payload.pickupAddress = {
        provinceId: f.pickupProvinceId,
        communeId: f.pickupCommuneId,
        address: f.pickupDetailAddress,
      };
    }

    if (this.canEditDeliveryAddress()) {
      payload.deliveryAddress = {
        provinceId: f.deliveryProvinceId,
        communeId: f.deliveryCommuneId,
        address: f.deliveryDetailAddress,
      };
    }

    this.ordersService.updateOrder(this.orderId, payload).subscribe({
      next: () => {
        this.loading = false;

        Swal.fire({
          icon: 'success',
          title: 'Cập nhật thành công!',
          text: 'Đơn hàng đã được lưu.',
          timer: 1500,
        }).then(() => {
          // Gửi email nếu có địa chỉ email
          if (f.email) {
            this.ordersService.resendWelcomeEmail(this.orderId).subscribe({
              next: () => console.log('Email thông báo đã gửi'),
              error: (err) => console.warn('Gửi email thất bại:', err),
            });
          }
          this.router.navigate(['/employee/orders/list']);
        });
      },
      error: (err) => {
        this.loading = false;
        Swal.fire('Lỗi!', err.error?.message || 'Cập nhật thất bại', 'error');
      },
    });
  }

  // ================== KHÔI PHỤC ĐƠN ==================
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
}
