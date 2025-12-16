import { AfterViewInit, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OrdersService } from '../../../services/dashboard/orders.service';
import { LocationService } from '../../../services/location.service';
import { Router, RouterModule } from '@angular/router';
import Swal from 'sweetalert2';
import { GeocodingService } from '../../../services/geocoding.service';
import { debounceTime } from 'rxjs/operators';
import { firstValueFrom, merge, startWith } from 'rxjs';
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
  senderPay = 0;
  receiverPay = 0;
  paymentNote = '';
  createdWaybill: string = '';
  submitting = false;

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
  }

  ngAfterViewInit() {
    setTimeout(() => {
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

      merge(
        this.orderForm.get('pickupProvinceId')!.valueChanges,
        this.orderForm.get('deliveryProvinceId')!.valueChanges,
        this.orderForm.get('weightKg')!.valueChanges,
        this.orderForm.get('serviceCode')!.valueChanges,
        this.orderForm.get('codValue')!.valueChanges,
        this.orderForm.get('shippingFeePayer')!.valueChanges.pipe(startWith('SENDER')),
        this.orderForm.get('paymentMethod')!.valueChanges.pipe(startWith('CASH'))
      )
        .pipe(debounceTime(300))
        .subscribe(() => {
          this.calculateShippingFee();
        });

      this.calculateShippingFee();
      this.updatePayments();
    }, 100);
  }

  private shouldSearch(type: 'pickup' | 'delivery'): boolean {
    const f = this.orderForm.value;
    const detail = type === 'pickup' ? f.pickupDetailAddress : f.deliveryDetailAddress;
    const provinceId = type === 'pickup' ? f.pickupProvinceId : f.deliveryProvinceId;
    const communeId = type === 'pickup' ? f.pickupCommuneId : f.deliveryCommuneId;
    const canSearch = !!(detail && detail.trim().length >= 3 && provinceId && communeId);
    if (canSearch) {
      console.log(`✅ Can search ${type}: "${detail}"`);
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

  async updatePickupMap() {
    const f = this.orderForm.value;
    if (!f.pickupProvinceId || !f.pickupCommuneId) return;
    const provinceName = this.getProvinceName(f.pickupProvinceId);
    const communeName = this.getCommuneName(f.pickupCommuneId);
    const detail = f.pickupDetailAddress?.trim();
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
          pickupLat: parseFloat(lat),
          pickupLng: parseFloat(lon),
        });
        console.log('Pickup geocoded:', q, '→', lat, lon);
        return;
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
      this.senderPay = payer === 'SENDER' ? this.shippingFee : 0;
      this.receiverPay = cod + (payer === 'RECEIVER' ? this.shippingFee : 0);
    } else if (method === 'COD') {
      this.senderPay = 0;
      this.receiverPay = cod + this.shippingFee;
    } else if (['MOMO', 'FAKE', 'BANK_TRANSFER'].includes(method)) {
      this.senderPay = this.shippingFee + (payer === 'SENDER' ? cod : 0);
      this.receiverPay = payer === 'RECEIVER' ? cod : 0;
    }
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
      this.updatePayments();
    }
  }

  onPickupMoved(pos: { lat: number; lng: number }) {
    this.orderForm.patchValue({ pickupLat: pos.lat, pickupLng: pos.lng });
    this.calculateShippingFee();
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
    const addr = event.address;
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
    let detailAddress = addr.split(currentCommune)[0] || addr.split(currentProvince)[0] || addr;
    detailAddress = detailAddress
      .replace(/, Việt Nam.*$/i, '')
      .replace(/, Hồ Chí Minh.*$/i, '')
      .replace(/, TP\.?\s?HCM.*$/i, '')
      .trim();
    if (detailAddress.endsWith(',')) {
      detailAddress = detailAddress.slice(0, -1).trim();
    }
    const controlName = event.type === 'pickup' ? 'pickupDetailAddress' : 'deliveryDetailAddress';
    this.orderForm.get(controlName)?.setValue(detailAddress || '');
  }

  // HÀM MỚI: Tạo đơn thực tế (tách riêng để dễ kiểm tra pending)
  private proceedCreateOrder(data: any) {
    this.ordersService.createOrder(data).subscribe({
      next: (res: any) => {
        console.log('Create order response:', res);
        this.loading = false;

        const orderId = res.data?.order?._id || res.data?._id;
        this.createdWaybill = res.data?.order?.waybill || res.data?.waybill || '';

        if (!orderId) {
          Swal.fire('Lỗi!', 'Không lấy được orderId từ response', 'error');
          return;
        }

        localStorage.setItem('waybill', this.createdWaybill);

        if (res.data?.redirectUrl) {
          Swal.fire({
            icon: 'info',
            title: 'Đang chuyển hướng đến thanh toán...',
            timer: 1500,
            timerProgressBar: true,
            didOpen: () => Swal.showLoading(),
          }).then(() => {
            window.location.href = res.data.redirectUrl;
          });
          return;
        }

        if (this.orderForm.value.paymentMethod === 'FAKE' && this.senderPay > 0) {
          // Show form nhập thẻ (giao diện đẹp)
          Swal.fire({
            title: 'Thanh toán bằng thẻ',
            html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: left; max-width: 100%;">
      <h5 class="mb-3 fw-bold text-primary">Nhập thông tin thẻ</h5>
      <p class="text-muted small mb-3">Lưu ý: Nếu lỗi kết nối, hãy truy cập <a href="https://fake-payment-tkh.onrender.com" target="_blank">gateway</a> để đánh thức server (chờ 1 phút).</p>
      <div class="mb-3">
        <label class="d-block fw-semibold mb-1" style="font-size: 14px;">Số thẻ</label>
        <input id="cardNumber" class="swal2-input" placeholder="4242 4242 4242 4242" value="4242424242424242" maxlength="19" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ced4da;">
      </div>
      <div class="mb-3">
        <label class="d-block fw-semibold mb-1" style="font-size: 14px;">Tên chủ thẻ</label>
        <input id="cardHolder" class="swal2-input" placeholder="NGUYEN VAN A" value="Test User" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ced4da;">
      </div>
      <div class="row mb-3">
        <div class="col-6">
          <label class="d-block fw-semibold mb-1" style="font-size: 14px;">Tháng hết hạn</label>
          <input id="expiryMonth" class="swal2-input text-center" placeholder="MM" value="12" maxlength="2" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ced4da;">
        </div>
        <div class="col-6">
          <label class="d-block fw-semibold mb-1" style="font-size: 14px;">Năm hết hạn</label>
          <input id="expiryYear" class="swal2-input text-center" placeholder="YYYY" value="2030" maxlength="4" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ced4da;">
        </div>
      </div>
      <div class="mb-3">
        <label class="d-block fw-semibold mb-1" style="font-size: 14px;">CVV</label>
        <input id="cvv" class="swal2-input text-center" placeholder="123" value="123" maxlength="3" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ced4da;">
      </div>
      <div class="text-center mt-3">
        <i class="bi bi-credit-card-2-front-fill fs-2 text-primary"></i>
      </div>
    </div>
  `,
            showCancelButton: true,
            confirmButtonText: 'Thanh toán',
            cancelButtonText: 'Hủy',
            confirmButtonColor: '#007bff',
            cancelButtonColor: '#dc3545',
            width: '1700px',
            padding: '1.5em',
            preConfirm: () => {
              if (this.submitting) {
                Swal.showValidationMessage('Đang xử lý, vui lòng chờ...');
                return false;
              }
              this.submitting = true;
              // Giữ nguyên logic validate và gọi API
              const cardNumber = (
                document.getElementById('cardNumber') as HTMLInputElement
              ).value.replace(/\s/g, '');
              const cardHolder = (document.getElementById('cardHolder') as HTMLInputElement).value;
              const expiryMonth = (document.getElementById('expiryMonth') as HTMLInputElement)
                .value;
              const expiryYear = (document.getElementById('expiryYear') as HTMLInputElement).value;
              const cvv = (document.getElementById('cvv') as HTMLInputElement).value;

              const cardData = {
                card_number: cardNumber,
                card_holder_name: cardHolder,
                expiryMonth,
                expiryYear,
                cvv,
                card_type: 'VISA',
              };

              if (!cardNumber || cardNumber.length !== 16 || isNaN(Number(cardNumber))) {
                Swal.showValidationMessage('Số thẻ không hợp lệ (phải là 16 chữ số)');
                return false;
              }
              if (
                !expiryMonth ||
                expiryMonth.length !== 2 ||
                Number(expiryMonth) < 1 ||
                Number(expiryMonth) > 12
              ) {
                Swal.showValidationMessage('Tháng hết hạn không hợp lệ (01-12)');
                return false;
              }
              if (
                !expiryYear ||
                expiryYear.length !== 4 ||
                Number(expiryYear) < new Date().getFullYear()
              ) {
                Swal.showValidationMessage('Năm hết hạn không hợp lệ');
                return false;
              }
              if (!cvv || cvv.length !== 3 || isNaN(Number(cvv))) {
                Swal.showValidationMessage('CVV không hợp lệ (3 chữ số)');
                return false;
              }

              this.loading = true;
              return this.ordersService
                .createFakePayment(orderId, cardData)
                .toPromise()
                .then((payRes: any) => {
                  this.submitting = false;
                  console.log('Received payRes full:', payRes);
                  this.loading = false;
                  if (payRes?.data?.success === true) {
                    return payRes.data;
                  } else {
                    Swal.showValidationMessage(
                      payRes?.data?.message || payRes?.message || 'Thanh toán thất bại từ gateway'
                    );
                    return false;
                  }
                })
                .catch((payErr) => {
                  this.submitting = false;
                  this.loading = false;
                  console.error('Payment HTTP error:', payErr);
                  Swal.showValidationMessage(
                    `Lỗi kết nối: ${
                      payErr.error?.message ||
                      payErr.message ||
                      'Unknown error. Kiểm tra kết nối gateway (có thể server Render đang sleep, chờ 1 phút và thử lại).'
                    }`
                  );
                  return false;
                });
            },
          })
            .then((result) => {
              if (result.dismiss === Swal.DismissReason.cancel) {
                Swal.fire({
                  icon: 'info',
                  title: 'Đã hủy thanh toán',
                  text: 'Đơn hàng đã được lưu với trạng thái chờ thanh toán. Bạn có thể quay lại thanh toán sau.',
                });
                return;
              }

              if (result.value && result.value.success) {
                Swal.fire({
                  icon: 'success',
                  title: 'Thanh toán thành công!',
                  text: result.value.message || 'Đang chuyển hướng...',
                  timer: 2000,
                  timerProgressBar: true,
                }).then(() => {
                  window.location.href = result.value.redirectUrl;
                });
              } else if (result.value) {
                Swal.fire(
                  'Lỗi thanh toán!',
                  result.value.message || 'Thanh toán thất bại',
                  'error'
                );
              }
            })
            .catch((err) => {
              console.error('Swal error:', err);
              Swal.fire('Lỗi!', 'Không thể xử lý thanh toán', 'error');
            });
        } else {
          // Thành công thông thường
          Swal.fire({
            icon: 'success',
            title: 'Tạo đơn thành công!',
            html: `
              <div class="text-center">
                <p class="mb-3 fs-5">Mã vận đơn của bạn là:</p>
                <h2 class="display-5 fw-bold text-secondary mb-4">${
                  this.createdWaybill || 'N/A'
                }</h2>
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
      paymentMethod: this.orderForm.value.paymentMethod,
    };

    // KIỂM TRA ĐƠN PENDING TRƯỚC KHI TẠO MỚI (CHỈ VỚI FAKE)
    if (this.orderForm.value.paymentMethod === 'FAKE' && this.senderPay > 0) {
      this.ordersService.getPendingOrders().subscribe({
        next: (res: any) => {
          if (res.data && res.data.length > 0) {
            const lastOrder = res.data[0];
            Swal.fire({
              icon: 'warning',
              title: 'Bạn có đơn hàng đang chờ thanh toán!',
              html: `
                <p>Mã vận đơn: <strong>${lastOrder.waybill}</strong></p>
                <p>Bạn có muốn tiếp tục tạo đơn mới không?</p>
              `,
              showCancelButton: true,
              confirmButtonText: 'Tạo đơn mới',
              cancelButtonText: 'Xem đơn cũ',
            }).then((result) => {
              if (result.isConfirmed) {
                this.proceedCreateOrder(data);
              } else {
                this.loading = false;
                this.router.navigate(['/employee/order/list']);
              }
            });
          } else {
            this.proceedCreateOrder(data);
          }
        },
        error: (err) => {
          console.error('Lỗi kiểm tra đơn pending:', err);
          this.proceedCreateOrder(data); // Vẫn tạo nếu lỗi kiểm tra
        },
      });
    } else {
      // Không phải FAKE → tạo bình thường
      this.proceedCreateOrder(data);
    }
  }
}
