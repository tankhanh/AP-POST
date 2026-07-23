import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrdersService } from '../../../services/dashboard/orders.service';
import { PaymentRecoveryService } from '../../../services/payment-recovery.service';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-list-order',
  templateUrl: './listOrder.html',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, DatePipe, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ListOrder implements OnInit {
  orders: any[] = [];
  filteredOrders: any[] = [];
  expandedOrderId: string | null = null;
  copiedWaybill: string | null = null;
  pageSize = 10;
  currentPage = 1;
  statusFilterOpen = false;
  loading = false;
  loadError = '';
  shippers: any[] = [];

  filters: any = {
    status: [],
    fromDate: '',
    toDate: '',
    minPrice: '',
    maxPrice: '',
    search: '',
    receiverName: '',
    receiverPhone: '',
  };

  statusOptions = [
    { value: 'PENDING', label: 'Chờ xác nhận' },
    { value: 'CONFIRMED', label: 'Đã xác nhận' },
    { value: 'SHIPPING', label: 'Đang giao' },
    { value: 'COMPLETED', label: 'Hoàn tất' },
    { value: 'CANCELED', label: 'Đã hủy' },
  ];

  constructor(
    private ordersService: OrdersService,
    private authService: AuthService,
    private paymentRecovery: PaymentRecoveryService,
  ) {}

  get createOrderLink(): any[] {
    return [
      this.authService.isCustomer(this.authService.getUser())
        ? '/customer/order/create'
        : '/employee/order/create',
    ];
  }

  editOrderLink(id: string): any[] {
    const base = this.authService.isCustomer(this.authService.getUser())
      ? '/customer/order/edit'
      : '/employee/order/edit';
    return [base, id];
  }

  get canConfirmManualPayment(): boolean {
    return !this.authService.isCustomer(this.authService.getUser());
  }

  ngOnInit() {
    this.loadOrders();
    if (this.canConfirmManualPayment) this.loadShippers();
  }

  loadShippers() {
    this.ordersService.getActiveShippers().subscribe({
      next: (response: any) => (this.shippers = response?.data ?? response ?? []),
      error: () => (this.shippers = []),
    });
  }

  loadOrders() {
    this.loading = true;
    this.loadError = '';
    const query = { ...this.filters };
    if (query.status?.length) query.status = query.status.join(',');
    this.ordersService.getOrders(query).subscribe({
      next: (res: any) => {
        this.orders = res.data?.results || [];
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.orders = [];
        this.filteredOrders = [];
        this.loadError = 'Không tải được danh sách đơn hàng.';
        this.loading = false;
      },
    });
  }

  applyFilters() {
    this.currentPage = 1;
    this.filteredOrders = this.orders.filter((order) => {
      const statusMatch = this.filters.status.length
        ? this.filters.status.includes(order.status)
        : true;
      const fromDateMatch = this.filters.fromDate
        ? new Date(order.createdAt) >= new Date(this.filters.fromDate)
        : true;
      const toDateMatch = this.filters.toDate
        ? new Date(order.createdAt) <= new Date(this.filters.toDate)
        : true;
      const minPriceMatch = this.filters.minPrice
        ? order.totalPrice >= +this.filters.minPrice
        : true;
      const maxPriceMatch = this.filters.maxPrice
        ? order.totalPrice <= +this.filters.maxPrice
        : true;
      const searchMatch = this.filters.search
        ? (order.waybill || '').toLowerCase().includes(this.filters.search.toLowerCase()) ||
          order._id.toLowerCase().includes(this.filters.search.toLowerCase())
        : true;
      const nameMatch = this.filters.receiverName
        ? order.receiverName.toLowerCase().includes(this.filters.receiverName.toLowerCase())
        : true;
      const phoneMatch = this.filters.receiverPhone
        ? order.receiverPhone.includes(this.filters.receiverPhone)
        : true;

      return (
        statusMatch &&
        fromDateMatch &&
        toDateMatch &&
        minPriceMatch &&
        maxPriceMatch &&
        searchMatch &&
        nameMatch &&
        phoneMatch
      );
    });
  }

  toggleExpand(id: string) {
    this.expandedOrderId = this.expandedOrderId === id ? null : id;
  }

  statusText(status: string): string {
    const map: any = {
      PENDING: 'Chờ xác nhận',
      CONFIRMED: 'Đã xác nhận',
      SHIPPING: 'Đang giao',
      COMPLETED: 'Hoàn tất',
      CANCELED: 'Đã hủy',
    };
    return map[status] || status;
  }

  statusClass(status: string): any {
    return {
      'text-info': status === 'PENDING',
      'text-primary': status === 'CONFIRMED',
      'text-warning': status === 'SHIPPING',
      'text-success': status === 'COMPLETED',
      'text-danger': status === 'CANCELED',
    };
  }

  canEdit(order: any) {
    if (this.authService.isCustomer(this.authService.getUser())) {
      return order.status === 'PENDING';
    }
    return true;
  }
  canDelete(order: any) {
    return ['PENDING', 'CANCELED'].includes(order.status);
  }

  deleteOrder(id: string, event: Event) {
    event.stopPropagation();
    Swal.fire({
      title: 'Chuyển đơn hàng vào thùng rác?',
      text: 'Bạn vẫn có thể khôi phục đơn hàng sau thao tác này.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Chuyển vào thùng rác',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#d03238',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.ordersService.deleteOrder(id).subscribe({
        next: () => {
          Swal.fire('Đã xóa', 'Đơn hàng đã được chuyển vào thùng rác.', 'success');
          this.loadOrders();
        },
        error: (err) =>
          Swal.fire('Không thể xóa', err.error?.message || 'Vui lòng thử lại.', 'error'),
      });
    });
  }

  // COPY MÃ VẬN ĐƠN
  copyWaybill(waybill: string, event: Event) {
    event.stopPropagation();
    navigator.clipboard
      .writeText(waybill)
      .then(() => {
        this.copiedWaybill = waybill;
        setTimeout(() => (this.copiedWaybill = null), 2000);
      })
      .catch(() =>
        Swal.fire('Không thể sao chép', 'Vui lòng sao chép mã vận đơn thủ công.', 'error'),
      );
  }

  // IN VẬN ĐƠN - ĐẸP CHUẨN A5
  printOrder(order: any) {
    order = this.escapeForHtml(order);
    const printWin = window.open('', '_blank');
    if (!printWin) {
      Swal.fire('Không mở được bản in', 'Vui lòng cho phép cửa sổ bật lên rồi thử lại.', 'warning');
      return;
    }

    const printHTML = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Vận đơn ${order.waybill || order._id}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 15px; width: 148mm; min-height: 210mm; background: white; }
  .container { border: 2px solid #000; padding: 20px; border-radius: 10px; }
  .header img { height: 60px; display: block; margin: 0 auto 10px; }
  .header h1 { text-align: center; margin: 10px 0; color: #1976d2; font-size: 24px; }
  .barcode { text-align: center; margin: 15px 0; }
  .barcode img { height: 70px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #333; padding: 10px; text-align: left; font-size: 14px; }
  th { background: #f0f0f0; width: 35%; }
  .text-right { text-align: right; }
  .status { padding: 6px 12px; border-radius: 6px; color: white; font-weight: bold; }
  .status-PENDING { background: #ffc107; color: black; }
  .status-CONFIRMED { background: #17a2b8; }
  .status-SHIPPING { background: #fd7e14; }
  .status-COMPLETED { background: #28a745; }
  .status-CANCELED { background: #dc3545; }
  .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #555; }
  @media print { body { padding: 5mm; } }
</style>
</head>
<body onload="window.print(); setTimeout(() => window.close(), 500);">
<div class="container">
  <div class="header">
    <h1>PHIẾU GỬI HÀNG</h1>
    <h2>Mã vận đơn: <strong>${order.waybill || 'Chưa có'}</strong></h2>
  </div>
  <div class="barcode">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${
      order.waybill || order._id
    }" alt="QR Code">
  </div>
  <table>
    <tr><th>Người gửi</th><td>${order.senderName || '—'}</td></tr>
    <tr><th>Lấy hàng</th><td>${this.formatAddress(order.pickupAddressId)}</td></tr>
    <tr><th>Người nhận</th><td>${order.receiverName}</td></tr>
    <tr><th>SĐT nhận</th><td>${order.receiverPhone}</td></tr>
    <tr><th>Giao hàng</th><td>${this.formatAddress(order.deliveryAddressId)}</td></tr>
    <tr><th>Dịch vụ</th><td>${order.serviceCode || '—'}</td></tr>
    <tr><th>COD</th><td class="text-right">${(order.codValue || 0).toLocaleString()} đ</td></tr>
    <tr><th>Phí ship</th><td class="text-right">${(
      order.shippingFee || 0
    ).toLocaleString()} đ</td></tr>
    <tr><th>Tổng tiền</th><td class="text-right"><strong>${order.totalPrice.toLocaleString()} đ</strong></td></tr>
    <tr><th>Trạng thái</th><td><span class="status status-${order.status}">${this.statusText(
      order.status,
    )}</span></td></tr>
  </table>
  ${
    order.items?.length
      ? `
  <h3 style="margin: 20px 0 10px;">Sản phẩm</h3>
  <table>
    <thead style="background:#e9ecef;"><tr><th>Sản phẩm</th><th class="text-right">SL</th><th class="text-right">Giá</th><th class="text-right">T.Tiền</th></tr></thead>
    <tbody>${order.items
      .map(
        (it: any) => `
      <tr><td>${it.productName}</td><td class="text-right">${
        it.quantity
      }</td><td class="text-right">${it.price.toLocaleString()} đ</td>
      <td class="text-right">${(it.quantity * it.price).toLocaleString()} đ</td></tr>`,
      )
      .join('')}
    </tbody>
  </table>`
      : ''
  }
  <div class="footer">
    <p>Ngày in: ${new Date().toLocaleString('vi-VN')}</p>
    <p>Cảm ơn Quý khách đã sử dụng dịch vụ!</p>
  </div>
</div>
</body></html>`;

    printWin.document.write(printHTML);
    printWin.document.close();
  }

  formatAddress(addr: any): string {
    if (!addr) return '—';
    const parts = [
      addr.address,
      addr.communeId?.name,
      addr.districtId?.name || addr.provinceId?.name,
    ].filter(Boolean);
    return parts.join(', ') || '—';
  }

  private escapeForHtml(value: any): any {
    if (typeof value === 'string') {
      return value.replace(
        /[&<>"']/g,
        (character) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
      );
    }
    if (Array.isArray(value)) return value.map((item) => this.escapeForHtml(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.escapeForHtml(item)]),
      );
    }
    return value;
  }

  pagedOrders() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredOrders.slice(start, start + this.pageSize);
  }

  totalPages(): number[] {
    const total = Math.ceil(this.filteredOrders.length / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages().length) this.currentPage = page;
  }

  toggleStatusFilter(value: string) {
    const i = this.filters.status.indexOf(value);
    if (i > -1) this.filters.status.splice(i, 1);
    else this.filters.status.push(value);
    this.applyFilters();
  }

  confirmManualPayment(order: any, event: Event) {
    event.stopPropagation();
    if (!this.canConfirmManualPayment) return;
    Swal.fire({
      title: 'Xác nhận đã nhận thanh toán?',
      text: `Đơn ${order.waybill} chỉ chuyển sang Đã xác nhận sau thao tác này.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Đã nhận tiền',
      cancelButtonText: 'Hủy',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.ordersService.confirmPayment(order._id).subscribe({
        next: () => {
          void Swal.fire('Thành công', 'Thanh toán đã được xác nhận.', 'success');
          this.loadOrders();
        },
        error: (error) =>
          void Swal.fire(
            'Không thể xác nhận',
            error.error?.message || 'Vui lòng thử lại.',
            'error',
          ),
      });
    });
  }

  retryMomoPayment(order: any, event: Event) {
    event.stopPropagation();
    if (!this.canConfirmManualPayment) return;
    Swal.fire({
      title: 'Tiếp tục thanh toán MoMo?',
      text: `Đơn ${order.waybill} sẽ được chuyển sang cổng thanh toán MoMo để hoàn tất.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Tiếp tục',
      cancelButtonText: 'Hủy',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.ordersService.initiateMomoPayment(order._id).subscribe({
        next: (res: any) => {
          // TransformInterceptor wraps: { statusCode, message, data: { success, data: { payUrl, ... } } }
          const inner = res?.data?.data ?? res?.data ?? res;
          const payUrl = inner?.payUrl || inner?.paymentUrl;
          const transactionCode = inner?.transactionCode;
          if (payUrl && transactionCode) {
            this.paymentRecovery.remember({
              method: 'MOMO',
              transactionCode,
              orderId: order._id,
              expiresAt: inner?.expiresAt,
            });
            window.location.assign(payUrl);
          } else {
            Swal.fire('Lỗi', 'Không nhận được đường dẫn thanh toán từ MoMo.', 'error');
          }
        },
        error: (error) => {
          Swal.fire(
            'Không thể tạo giao dịch',
            error.error?.message || 'Vui lòng thử lại sau.',
            'error',
          );
        },
      });
    });
  }

  async manageShipper(order: any, event: Event) {
    event.stopPropagation();
    if (!this.canConfirmManualPayment) return;
    if (!this.shippers.length) {
      await Swal.fire('Chưa có shipper', 'Chi nhánh chưa có shipper đang hoạt động.', 'info');
      return;
    }
    const currentId = order.assignedShipperId?._id || order.assignedShipperId || '';
    const options: Record<string, string> = Object.fromEntries(
      this.shippers.map((shipper) => [
        shipper._id,
        `${shipper.name}${shipper.phone ? ` · ${shipper.phone}` : ''}`,
      ]),
    );
    if (currentId) options['__unassign'] = '— Hủy phân công hiện tại —';
    const result = await Swal.fire({
      title: `Phân công đơn ${order.waybill}`,
      input: 'select',
      inputOptions: options,
      inputValue: currentId,
      inputPlaceholder: 'Chọn shipper',
      showCancelButton: true,
      confirmButtonText: 'Lưu phân công',
      cancelButtonText: 'Hủy',
      inputValidator: (value) => (!value ? 'Vui lòng chọn shipper.' : undefined),
    });
    if (!result.isConfirmed) return;
    const request =
      result.value === '__unassign'
        ? this.ordersService.unassignShipper(order._id)
        : this.ordersService.assignShipper(order._id, result.value);
    request.subscribe({
      next: () => {
        void Swal.fire('Đã cập nhật', 'Phân công shipper đã được lưu.', 'success');
        this.loadOrders();
      },
      error: (error) =>
        void Swal.fire('Không thể phân công', error.error?.message || 'Vui lòng thử lại.', 'error'),
    });
  }

}
