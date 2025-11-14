import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OrdersService } from '../../services/dashboard/orders.service';
import { LocationService } from '../../services/location.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './createOrder.html',
})
export class CreateOrder implements OnInit {
  orderForm!: FormGroup;
  loading = false;

  provinces: any[] = [];
  pickupCommunes: any[] = [];
  deliveryCommunes: any[] = [];

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();
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
      totalPrice: [0, [Validators.required, Validators.min(0)]],
    });
  }

  loadProvinces() {
    this.locationService.getProvinces().subscribe({
      next: (res) => {
        console.log('Provinces API:', res);
        this.provinces = res.data || [];
      },
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
      },
      error: (err) => console.error(err),
    });
  }

  submit() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }

    this.loading = true;
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

    const data = {
      senderName: f.senderName,
      receiverName: f.receiverName,
      receiverPhone: f.receiverPhone,
      pickupAddress,
      deliveryAddress,
      totalPrice: f.totalPrice,
    };

    this.ordersService.createOrder(data).subscribe({
      next: () => {
        this.loading = false;
        Swal.fire({
          icon: 'success',
          title: 'Tạo đơn hàng thành công!',
          timer: 1500,
          showConfirmButton: false,
        });
        this.router.navigate(['/dashboard/order/list']);
      },
      error: (err) => {
        this.loading = false;
        Swal.fire({
          icon: 'error',
          title: 'Tạo đơn hàng thất bại!',
          text: err.error?.message || 'Vui lòng thử lại.',
        });
      },
    });
  }
}
