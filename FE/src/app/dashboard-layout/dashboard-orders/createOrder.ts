import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OrdersService } from '../../services/dashboard/orders.service';
import { LocationService } from '../../services/location.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { MapPickerComponent } from '../../shared/map-picker/map-picker';
import { GeocodingService } from '../../services/geocoding.service';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-create-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, MapPickerComponent],
  templateUrl: './createOrder.html',
})
export class CreateOrder implements OnInit {
  @ViewChild('pickupMap') pickupMap!: MapPickerComponent;
  @ViewChild('deliveryMap') deliveryMap!: MapPickerComponent;

  orderForm!: FormGroup;
  loading = false;

  provinces: any[] = [];
  pickupCommunes: any[] = [];
  deliveryCommunes: any[] = [];

  constructor(
    private fb: FormBuilder,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private router: Router,
    private geocoding: GeocodingService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadProvinces();

    // Debounce input địa chỉ pickup
    this.orderForm
      .get('pickupDetailAddress')!
      .valueChanges.pipe(debounceTime(500))
      .subscribe(() => this.updatePickupMap());

    // Debounce input địa chỉ delivery
    this.orderForm
      .get('deliveryDetailAddress')!
      .valueChanges.pipe(debounceTime(500))
      .subscribe(() => this.updateDeliveryMap());
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
      pickupLat: [''],
      pickupLng: [''],
      deliveryLat: [''],
      deliveryLng: [''],
    });
  }

  loadProvinces() {
    this.locationService.getProvinces().subscribe({
      next: (res) => {
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
      lat: f.pickupLat,
      lng: f.pickupLng,
    };

    const deliveryAddress = {
      provinceId: f.deliveryProvinceId,
      communeId: f.deliveryCommuneId,
      address: f.deliveryDetailAddress,
      lat: f.deliveryLat,
      lng: f.deliveryLng,
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

  setPickupLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({
      pickupLat: pos.lat,
      pickupLng: pos.lng,
    });
  }

  setDeliveryLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({
      deliveryLat: pos.lat,
      deliveryLng: pos.lng,
    });
  }

  updatePickupMap() {
    const f = this.orderForm.value;

    if (!f.pickupDetailAddress || !f.pickupProvinceId || !f.pickupCommuneId) return;

    const fullAddress =
      `${this.getCommuneName(f.pickupCommuneId)}, ` +
      `${this.getProvinceName(f.pickupProvinceId)}, ` +
      f.pickupDetailAddress;

    this.geocoding.search(fullAddress).subscribe((res) => {
      if (!res || res.length === 0) return;

      const lat = parseFloat(res[0].lat);
      const lng = parseFloat(res[0].lon);

      this.orderForm.patchValue({ pickupLat: lat, pickupLng: lng });
      if (this.pickupMap) this.pickupMap.setMarker(lat, lng);
    });
  }

  updateDeliveryMap() {
    const f = this.orderForm.value;

    if (!f.deliveryDetailAddress || !f.deliveryProvinceId || !f.deliveryCommuneId) return;

    const fullAddress =
      `${this.getCommuneName(f.deliveryCommuneId)}, ` +
      `${this.getProvinceName(f.deliveryProvinceId)}, ` +
      f.deliveryDetailAddress;

    this.geocoding.search(fullAddress).subscribe((res) => {
      if (!res || res.length === 0) return;

      const lat = parseFloat(res[0].lat);
      const lng = parseFloat(res[0].lon);

      this.orderForm.patchValue({ deliveryLat: lat, deliveryLng: lng });

      if (this.deliveryMap) this.deliveryMap.setMarker(lat, lng);
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
}
