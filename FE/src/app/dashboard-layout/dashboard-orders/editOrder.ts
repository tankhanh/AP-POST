import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OrdersService } from '../../services/dashboard/orders.service';
import { LocationService } from '../../services/location.service';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';
import { MapPickerComponent } from '../../shared/map-picker/map-picker';
import { GeocodingService } from '../../services/geocoding.service';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-edit-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MapPickerComponent],
  templateUrl: './editOrder.html',
})
export class EditOrder implements OnInit, AfterViewInit {
  @ViewChild('pickupMap') pickupMap!: MapPickerComponent;
  @ViewChild('deliveryMap') deliveryMap!: MapPickerComponent;

  orderForm: FormGroup;
  orderId: string = '';
  loading = false;

  provinces: any[] = [];
  pickupCommunes: any[] = [];
  deliveryCommunes: any[] = [];

  pickupMarker?: { lat: number; lng: number };
  deliveryMarker?: { lat: number; lng: number };

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private ordersService: OrdersService,
    private locationService: LocationService,
    private geocoding: GeocodingService,
    private router: Router
  ) {
    // Khởi tạo form ngay từ đầu để tránh null
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

      totalPrice: [0, [Validators.required, Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot?.params?.['id'];
    if (!id) {
      console.error('No orderId found in route params');
      return;
    }
    this.orderId = id;

    this.loadProvinces();
    this.loadOrderDetail();

    // Debounce địa chỉ để update map
    this.orderForm
      .get('pickupDetailAddress')
      ?.valueChanges.pipe(debounceTime(500))
      .subscribe(() => this.updatePickupMap());

    this.orderForm
      .get('deliveryDetailAddress')
      ?.valueChanges.pipe(debounceTime(500))
      .subscribe(() => this.updateDeliveryMap());
  }

  ngAfterViewInit() {
    // Sau khi view render xong, set marker nếu đã có dữ liệu
    if (this.pickupMarker) this.pickupMap.setMarker(this.pickupMarker.lat, this.pickupMarker.lng);
    if (this.deliveryMarker)
      this.deliveryMap.setMarker(this.deliveryMarker.lat, this.deliveryMarker.lng);
  }

  loadProvinces() {
    this.locationService.getProvinces().subscribe((res) => {
      this.provinces = res.data || [];
    });
  }

  loadOrderDetail() {
    if (!this.orderId) return;

    this.ordersService.getOrderById(this.orderId).subscribe((res) => {
      const o = res.data;
      if (!o) return;

      // Patch dữ liệu vào form
      this.orderForm.patchValue({
        senderName: o.senderName,
        receiverName: o.receiverName,
        receiverPhone: o.receiverPhone,

        pickupProvinceId: o.pickupAddressId?.provinceId?._id || '',
        pickupCommuneId: o.pickupAddressId?.communeId?._id || '',
        pickupDetailAddress: o.pickupAddressId?.address || '',
        pickupLat: o.pickupAddressId?.lat || null,
        pickupLng: o.pickupAddressId?.lng || null,

        deliveryProvinceId: o.deliveryAddressId?.provinceId?._id || '',
        deliveryCommuneId: o.deliveryAddressId?.communeId?._id || '',
        deliveryDetailAddress: o.deliveryAddressId?.address || '',
        deliveryLat: o.deliveryAddressId?.lat || null,
        deliveryLng: o.deliveryAddressId?.lng || null,

        totalPrice: o.totalPrice || 0,
      });

      this.onPickupProvinceChange(false);
      this.onDeliveryProvinceChange(false);

      // Lưu tạm marker
      if (o.pickupAddressId?.lat && o.pickupAddressId?.lng)
        this.pickupMarker = { lat: o.pickupAddressId.lat, lng: o.pickupAddressId.lng };
      if (o.deliveryAddressId?.lat && o.deliveryAddressId?.lng)
        this.deliveryMarker = { lat: o.deliveryAddressId.lat, lng: o.deliveryAddressId.lng };
    });
  }

  onPickupProvinceChange(reset = true): void {
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

  onDeliveryProvinceChange(reset = true): void {
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

  setPickupLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ pickupLat: pos.lat, pickupLng: pos.lng });
  }

  setDeliveryLocation(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ deliveryLat: pos.lat, deliveryLng: pos.lng });
  }

  updatePickupMap() {
    const f = this.orderForm.value;
    if (!f.pickupDetailAddress || !f.pickupProvinceId || !f.pickupCommuneId) return;

    const fullAddress = `${this.getCommuneName(f.pickupCommuneId)}, ${this.getProvinceName(
      f.pickupProvinceId
    )}, ${f.pickupDetailAddress}`;

    this.geocoding.search(fullAddress).subscribe((res) => {
      if (!res?.length) return;
      const lat = parseFloat(res[0].lat);
      const lng = parseFloat(res[0].lon);
      this.orderForm.patchValue({ pickupLat: lat, pickupLng: lng });
      this.pickupMap?.setMarker(lat, lng);
    });
  }

  updateDeliveryMap() {
    const f = this.orderForm.value;
    if (!f.deliveryDetailAddress || !f.deliveryProvinceId || !f.deliveryCommuneId) return;

    const fullAddress = `${this.getCommuneName(f.deliveryCommuneId)}, ${this.getProvinceName(
      f.deliveryProvinceId
    )}, ${f.deliveryDetailAddress}`;

    this.geocoding.search(fullAddress).subscribe((res) => {
      if (!res?.length) return;
      const lat = parseFloat(res[0].lat);
      const lng = parseFloat(res[0].lon);
      this.orderForm.patchValue({ deliveryLat: lat, deliveryLng: lng });
      this.deliveryMap?.setMarker(lat, lng);
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
        Swal.fire({ icon: 'success', title: 'Cập nhật thành công!', timer: 1500, showConfirmButton: false });
        this.router.navigate(['/dashboard/order/list']);
      },
      error: (err) => {
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Cập nhật thất bại', text: err.error?.message || 'Vui lòng thử lại.' });
      },
    });
  }
}
