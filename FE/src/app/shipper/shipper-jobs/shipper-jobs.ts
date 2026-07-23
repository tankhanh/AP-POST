import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import {
  ShipperJob,
  ShipperJobsView,
  ShipperService,
  ShipperSummary,
} from '../../services/shipper.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-shipper-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './shipper-jobs.html',
  styleUrl: './shipper-jobs.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShipperJobs implements OnInit, OnDestroy {
  jobs: ShipperJob[] = [];
  summary: ShipperSummary = {
    assigned: 0,
    delivering: 0,
    failed: 0,
    completedToday: 0,
    totalCompleted: 0,
    codToCollect: 0,
    shippingFees: 0,
  };
  view: ShipperJobsView = 'active';
  search = '';
  loading = false;
  loadingMore = false;
  error = '';
  busyOrderId = '';
  currentPage = 1;
  totalPages = 1;
  totalJobs = 0;
  readonly pageSize = 10;
  readonly proofFiles = new Map<string, File>();
  private routeSubscription?: Subscription;
  private notificationSubscription?: Subscription;
  private assignmentSubscription?: Subscription;

  constructor(
    private readonly shipperService: ShipperService,
    private readonly route: ActivatedRoute,
    private readonly socketService: SocketService,
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.data.subscribe((data) => {
      this.view = (data['view'] || 'active') as ShipperJobsView;
      this.refresh();
    });
    this.socketService.connect();
    this.notificationSubscription = this.socketService
      .on('notification')
      .subscribe((notification) => {
        if (notification?.relatedOrderId) this.refresh();
      });
    this.assignmentSubscription = this.socketService
      .on('assignment:changed')
      .subscribe(() => this.refresh());
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.notificationSubscription?.unsubscribe();
    this.assignmentSubscription?.unsubscribe();
  }

  refresh() {
    this.currentPage = 1;
    this.totalPages = 1;
    this.jobs = [];
    this.loadJobs(false);
    this.shipperService.getSummary().subscribe({
      next: (summary) => (this.summary = { ...this.summary, ...summary }),
      error: () => undefined,
    });
  }

  loadMore() {
    if (this.loading || this.loadingMore || this.currentPage >= this.totalPages) return;
    this.currentPage += 1;
    this.loadJobs(true);
  }

  private loadJobs(append: boolean) {
    if (append) this.loadingMore = true;
    else this.loading = true;
    this.error = '';
    this.shipperService
      .getJobs(this.view, this.search.trim(), this.currentPage, this.pageSize)
      .subscribe({
        next: (response) => {
          this.jobs = append
            ? [...this.jobs, ...(response?.results ?? [])]
            : (response?.results ?? []);
          this.currentPage = response?.meta?.current ?? this.currentPage;
          this.totalPages = response?.meta?.pages ?? 1;
          this.totalJobs = response?.meta?.total ?? this.jobs.length;
          this.loading = false;
          this.loadingMore = false;
        },
        error: (error) => {
          if (!append) this.jobs = [];
          else this.currentPage = Math.max(1, this.currentPage - 1);
          this.error = error.error?.message || 'Không thể tải danh sách đơn giao.';
          this.loading = false;
          this.loadingMore = false;
        },
      });
  }

  changeView(view: ShipperJobsView) {
    this.view = view;
    this.refresh();
  }

  async accept(job: ShipperJob) {
    const confirmed = await Swal.fire({
      title: 'Nhận đơn giao?',
      text: `Bạn xác nhận phụ trách đơn ${job.waybill}.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Nhận đơn',
      cancelButtonText: 'Để sau',
    });
    if (!confirmed.isConfirmed) return;
    await this.runAction(job._id, this.shipperService.accept(job._id), 'Đã nhận đơn giao.');
  }

  async reject(job: ShipperJob) {
    const result = await Swal.fire({
      title: 'Từ chối đơn giao?',
      input: 'select',
      inputLabel: 'Lý do từ chối',
      inputOptions: {
        'Tuyến giao không phù hợp': 'Tuyến giao không phù hợp',
        'Phương tiện không đáp ứng': 'Phương tiện không đáp ứng',
        'Đang quá tải đơn giao': 'Đang quá tải đơn giao',
        'Không thể làm việc trong khung giờ này': 'Không thể làm việc trong khung giờ này',
        'Lý do cá nhân hoặc sức khỏe': 'Lý do cá nhân hoặc sức khỏe',
      },
      inputPlaceholder: 'Chọn lý do',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xác nhận từ chối',
      cancelButtonText: 'Quay lại',
      inputValidator: (value) => (!value ? 'Vui lòng chọn lý do từ chối.' : undefined),
    });
    if (!result.isConfirmed || !result.value) return;
    await this.runAction(
      job._id,
      this.shipperService.reject(job._id, result.value),
      'Đơn đã được trả về hàng chờ điều phối.',
    );
  }

  async start(job: ShipperJob) {
    const confirmed = await Swal.fire({
      title: 'Bắt đầu giao hàng?',
      text: 'Khách hàng sẽ thấy đơn chuyển sang trạng thái Đang giao.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Bắt đầu giao',
      cancelButtonText: 'Hủy',
    });
    if (!confirmed.isConfirmed) return;
    await this.runAction(
      job._id,
      this.shipperService.start(job._id),
      'Đơn đã chuyển sang Đang giao.',
    );
  }

  async complete(job: ShipperJob) {
    const result = await Swal.fire({
      title: 'Xác nhận giao thành công',
      html: `
        <input id="recipient-name" class="swal2-input" maxlength="120" placeholder="Tên người nhận thực tế">
        <textarea id="delivery-note" class="swal2-textarea" maxlength="500" placeholder="Ghi chú (không bắt buộc)"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Hoàn tất giao',
      cancelButtonText: 'Hủy',
      preConfirm: () => {
        const recipientName = (
          document.getElementById('recipient-name') as HTMLInputElement
        )?.value.trim();
        const note = (
          document.getElementById('delivery-note') as HTMLTextAreaElement
        )?.value.trim();
        if (!recipientName) {
          Swal.showValidationMessage('Vui lòng nhập tên người nhận thực tế.');
          return undefined;
        }
        return { recipientName, note };
      },
    });
    if (!result.isConfirmed || !result.value) return;

    this.busyOrderId = job._id;
    try {
      let location: { lat?: number; lng?: number } = {};
      try {
        const position = await this.getCurrentPosition();
        location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } catch {
        // Vị trí hỗ trợ đối soát nhưng không được phép chặn thao tác giao hàng.
      }
      const proof = this.proofFiles.get(job._id);
      const proofOfDeliveryUrl = proof
        ? await firstValueFrom(this.shipperService.uploadProof(proof))
        : undefined;
      await firstValueFrom(
        this.shipperService.complete(job._id, {
          ...result.value,
          proofOfDeliveryUrl,
          ...location,
        }),
      );
      this.proofFiles.delete(job._id);
      await Swal.fire('Đã giao thành công', `Đơn ${job.waybill} đã hoàn tất.`, 'success');
      this.refresh();
    } catch (error: any) {
      await Swal.fire(
        'Chưa thể hoàn tất',
        error?.error?.message || error?.message || 'Vui lòng kiểm tra kết nối và thử lại.',
        'error',
      );
    } finally {
      this.busyOrderId = '';
    }
  }

  async fail(job: ShipperJob) {
    const result = await Swal.fire({
      title: 'Báo giao chưa thành công',
      input: 'textarea',
      inputLabel: 'Lý do',
      inputPlaceholder: 'Ví dụ: Không liên hệ được người nhận',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: 'Gửi báo cáo',
      cancelButtonText: 'Hủy',
      inputValidator: (value) => (!value?.trim() ? 'Vui lòng nhập lý do.' : undefined),
    });
    if (!result.isConfirmed) return;

    let location: { lat?: number; lng?: number } = {};
    try {
      const position = await this.getCurrentPosition();
      location = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      // Failure reports remain available when location permission is unavailable.
    }
    await this.runAction(
      job._id,
      this.shipperService.fail(job._id, { reason: result.value.trim(), ...location }),
      'Đã gửi báo cáo giao chưa thành công.',
    );
  }

  async retry(job: ShipperJob) {
    const confirmed = await Swal.fire({
      title: 'Tiếp tục giao lại?',
      text: `Đơn ${job.waybill} sẽ quay lại trạng thái đang giao.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Tiếp tục giao',
      cancelButtonText: 'Để sau',
    });
    if (!confirmed.isConfirmed) return;
    await this.runAction(
      job._id,
      this.shipperService.retry(job._id),
      'Đơn đã được đưa lại vào tuyến giao.',
    );
  }

  async shareLocation(job: ShipperJob) {
    this.busyOrderId = job._id;
    try {
      const position = await this.getCurrentPosition();
      await firstValueFrom(
        this.shipperService.updateLocation(
          job._id,
          position.coords.latitude,
          position.coords.longitude,
        ),
      );
      await Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: 'Đã cập nhật vị trí',
        showConfirmButton: false,
        timer: 1800,
      });
    } catch (error: any) {
      await Swal.fire(
        'Không thể cập nhật vị trí',
        error?.message || 'Vui lòng cấp quyền vị trí.',
        'error',
      );
    } finally {
      this.busyOrderId = '';
    }
  }

  selectProof(jobId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 1024 * 1024) {
      input.value = '';
      void Swal.fire('Ảnh không hợp lệ', 'Chỉ nhận JPG/PNG tối đa 1 MB.', 'warning');
      return;
    }
    this.proofFiles.set(jobId, file);
  }

  proofName(jobId: string): string {
    return this.proofFiles.get(jobId)?.name || '';
  }

  mapUrl(job: ShipperJob): string {
    const address = job.deliveryAddressId;
    const destination =
      address?.lat && address?.lng ? `${address.lat},${address.lng}` : this.formatAddress(address);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  formatAddress(address?: ShipperJob['deliveryAddressId']): string {
    if (!address) return 'Chưa có địa chỉ';
    return [address.address, address.communeId?.name, address.provinceId?.name]
      .filter(Boolean)
      .join(', ');
  }

  stateLabel(state: string): string {
    const labels: Record<string, string> = {
      ASSIGNED: 'Chờ nhận đơn',
      ACCEPTED: 'Đã nhận đơn',
      DELIVERING: 'Đang giao',
      DELIVERED: 'Đã giao',
      FAILED: 'Giao chưa thành công',
    };
    return labels[state] || state;
  }

  trackJob(_index: number, job: ShipperJob): string {
    return job._id;
  }

  private async runAction(orderId: string, request: any, successMessage: string) {
    this.busyOrderId = orderId;
    try {
      await firstValueFrom(request);
      await Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: successMessage,
        showConfirmButton: false,
        timer: 1800,
      });
      this.refresh();
    } catch (error: any) {
      await Swal.fire('Không thể cập nhật', error?.error?.message || 'Vui lòng thử lại.', 'error');
    } finally {
      this.busyOrderId = '';
    }
  }

  private getCurrentPosition(): Promise<GeolocationPosition> {
    if (!navigator.geolocation) return Promise.reject(new Error('Thiết bị không hỗ trợ định vị.'));
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 30_000,
      }),
    );
  }
}
