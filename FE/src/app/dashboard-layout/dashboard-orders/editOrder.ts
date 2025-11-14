import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OrdersService } from '../../services/dashboard/orders.service';
import { LocationService } from '../../services/location.service';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-edit-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './editOrder.html',
})
export class EditOrder implements OnInit {
  orderForm!: FormGroup;
  orderId: string = '';
  loading = false;

  provinces = [];
  pickupCommunes = [];
  deliveryCommunes = [];

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.orderId = this.route.snapshot.params['id'];
    this.initForm();
    this.loadProvinces();
    this.loadOrderDetail();
  }

  initForm() {
    this.orderForm = this.fb.group({
      senderName: ['', Validators.required],
      receiverName: ['', Validators.required],
      receiverPhone: ['', Validators.required],

      pickupProvinceId: ['', Validators.required],
      pickupCommuneId: ['', Validators.required],
      pickupDetailAddress: ['', Validators.required],

      deliveryProvinceId: ['', Validators.required],
      deliveryCommuneId: ['', Validators.required],
      deliveryDetailAddress: ['', Validators.required],

      totalPrice: [0, Validators.required],
    });
  }

  loadProvinces() {
    this.locationService.getProvinces().subscribe((res) => {
      this.provinces = res.data;
    });
  }

  loadOrderDetail() {
    this.ordersService.getOrderById(this.orderId).subscribe((res) => {
      const o = res.data;

      // fill form
      this.orderForm.patchValue({
        senderName: o.senderName,
        receiverName: o.receiverName,
        receiverPhone: o.receiverPhone,

        pickupProvinceId: o.pickupAddressId.provinceId._id,
        pickupCommuneId: o.pickupAddressId.communeId._id,
        pickupDetailAddress: o.pickupAddressId.address,

        deliveryProvinceId: o.deliveryAddressId.provinceId._id,
        deliveryCommuneId: o.deliveryAddressId.communeId._id,
        deliveryDetailAddress: o.deliveryAddressId.address,

        totalPrice: o.totalPrice,
      });

      // load communes
      this.onPickupProvinceChange(false);
      this.onDeliveryProvinceChange(false);
    });
  }

  onPickupProvinceChange(reset = true) {
    const id = this.orderForm.get('pickupProvinceId')?.value;
    this.locationService.getCommunes(id).subscribe((res) => {
      this.pickupCommunes = res.data;
      if (reset) this.orderForm.get('pickupCommuneId')?.setValue('');
    });
  }

  onDeliveryProvinceChange(reset = true) {
    const id = this.orderForm.get('deliveryProvinceId')?.value;
    this.locationService.getCommunes(id).subscribe((res) => {
      this.deliveryCommunes = res.data;
      if (reset) this.orderForm.get('deliveryCommuneId')?.setValue('');
    });
  }

  submit() {
  if (this.orderForm.invalid) {
    this.orderForm.markAllAsTouched();
    return;
  }

  this.loading = true; // bật loading
  const f = this.orderForm.value;

  const pickupAddress = {
    provinceId: f.pickupProvinceId,
    communeId: f.pickupCommuneId,
    address: f.pickupDetailAddress,
  };

  const deliveryAddress = {
    provinceId: f.deliveryProvinceId,
    communeId: f.deliveryCommuneId,
    address: f.deliveryDetailAddress,
  };

  const payload = {
    senderName: f.senderName,
    receiverName: f.receiverName,
    receiverPhone: f.receiverPhone,
    pickupAddress,
    deliveryAddress,
    totalPrice: f.totalPrice,
  };

  this.ordersService.updateOrder(this.orderId, payload).subscribe({
    next: () => {
      this.loading = false;
      Swal.fire({
        icon: 'success',
        title: 'Cập nhật đơn hàng thành công!',
        timer: 1500,
        showConfirmButton: false,
      });
      this.router.navigate(['/dashboard/order/list']);
    },
    error: (err) => {
      this.loading = false
      Swal.fire({
        icon: 'error',
        title: 'Cập nhật thất bại!',
        text: err.error?.message || 'Vui lòng thử lại.',
      });
    },
  });
}

}
