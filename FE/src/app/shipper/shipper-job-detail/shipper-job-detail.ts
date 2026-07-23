import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, Observable, Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import { ShipperAddress, ShipperJob, ShipperService } from '../../services/shipper.service';
import { SocketService } from '../../services/socket.service';
import { env } from '../../environments/environment';

@Component({
  selector: 'app-shipper-job-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './shipper-job-detail.html',
  styleUrl: './shipper-job-detail.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShipperJobDetail implements OnInit, OnDestroy {
  job?: ShipperJob;
  loading = true;
  busy = false;
  error = '';
  proofFile?: File;
  proofImageFailed = false;
  private assignmentSubscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly shipperService: ShipperService,
    private readonly router: Router,
    private readonly socketService: SocketService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.socketService.connect();
    this.assignmentSubscription = this.socketService
      .on('assignment:changed')
      .subscribe((event) => {
        if (event?.orderId === this.job?._id) void this.router.navigate(['/shipper/jobs']);
      });
  }

  ngOnDestroy(): void {
    this.assignmentSubscription?.unsubscribe();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading = false;
      this.error = 'Mã đơn giao không hợp lệ.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.shipperService.getJob(id).subscribe({
      next: (job) => {
        this.job = job;
        this.proofImageFailed = false;
        this.loading = false;
      },
      error: (error) => {
        this.error = error?.error?.message || 'Không thể tải chi tiết đơn giao.';
        this.loading = false;
      },
    });
  }

  async accept(): Promise<void> {
    if (!this.job) return;
    const confirmed = await this.confirm(
      'Nhận đơn giao?',
      `Xác nhận phụ trách đơn ${this.job.waybill}.`,
      'Nhận đơn',
    );
    if (confirmed) await this.run(this.shipperService.accept(this.job._id), 'Đã nhận đơn giao.');
  }

  async reject(): Promise<void> {
    if (!this.job) return;
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
    await this.run(
      this.shipperService.reject(this.job._id, result.value),
      'Đơn đã được trả về hàng chờ điều phối.',
      true,
    );
  }

  async start(): Promise<void> {
    if (!this.job) return;
    const confirmed = await this.confirm(
      'Bắt đầu giao hàng?',
      'Trạng thái sẽ được cập nhật để khách hàng theo dõi.',
      'Bắt đầu giao',
    );
    if (confirmed) await this.run(this.shipperService.start(this.job._id), 'Đã bắt đầu giao.');
  }

  async retry(): Promise<void> {
    if (!this.job) return;
    const confirmed = await this.confirm(
      'Tiếp tục giao lại?',
      'Lần giao mới sẽ được ghi nhận trong lịch sử đơn.',
      'Tiếp tục giao',
    );
    if (confirmed) await this.run(this.shipperService.retry(this.job._id), 'Đã tiếp tục giao lại.');
  }

  async complete(): Promise<void> {
    if (!this.job) return;
    if (!this.proofFile) {
      await Swal.fire(
        'Thiếu ảnh giao hàng',
        'Vui lòng chụp hoặc chọn ảnh bằng chứng trước khi hoàn tất đơn.',
        'warning',
      );
      return;
    }
    const result = await Swal.fire({
      title: 'Xác nhận giao thành công',
      html: `
        <input id="pod-recipient" class="swal2-input" maxlength="120" placeholder="Tên người nhận thực tế">
        <textarea id="pod-note" class="swal2-textarea" maxlength="500" placeholder="Ghi chú (không bắt buộc)"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Hoàn tất giao',
      cancelButtonText: 'Hủy',
      focusConfirm: false,
      preConfirm: () => {
        const recipientName = (
          document.getElementById('pod-recipient') as HTMLInputElement | null
        )?.value.trim();
        const note = (
          document.getElementById('pod-note') as HTMLTextAreaElement | null
        )?.value.trim();
        if (!recipientName) {
          Swal.showValidationMessage('Vui lòng nhập tên người nhận thực tế.');
          return undefined;
        }
        return { recipientName, note };
      },
    });
    if (!result.isConfirmed || !result.value) return;

    this.busy = true;
    try {
      const location = await this.optionalLocation();
      const proofOfDeliveryUrl = this.proofFile
        ? await firstValueFrom(this.shipperService.uploadProof(this.proofFile))
        : undefined;
      await firstValueFrom(
        this.shipperService.complete(this.job._id, {
          ...result.value,
          ...location,
          proofOfDeliveryUrl,
        }),
      );
      this.proofFile = undefined;
      await this.success('Đơn đã được xác nhận giao thành công.');
      this.load();
    } catch (error: any) {
      await this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async fail(): Promise<void> {
    if (!this.job) return;
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
    const location = await this.optionalLocation();
    await this.run(
      this.shipperService.fail(this.job._id, { reason: result.value.trim(), ...location }),
      'Đã ghi nhận kết quả giao chưa thành công.',
    );
  }

  async updateLocation(): Promise<void> {
    if (!this.job) return;
    this.busy = true;
    try {
      const position = await this.currentPosition();
      await firstValueFrom(
        this.shipperService.updateLocation(
          this.job._id,
          position.coords.latitude,
          position.coords.longitude,
        ),
      );
      await this.success('Đã cập nhật vị trí hiện tại.');
      this.load();
    } catch (error: any) {
      await this.showError(error, 'Không thể lấy vị trí. Hãy kiểm tra quyền định vị.');
    } finally {
      this.busy = false;
    }
  }

  selectProof(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 1024 * 1024) {
      input.value = '';
      void Swal.fire('Ảnh không hợp lệ', 'Chỉ nhận JPG/PNG tối đa 1 MB.', 'warning');
      return;
    }
    this.proofFile = file;
  }

  proofImageUrl(value?: string): string {
    if (!value) return '';
    const apiOrigin =
      env.baseUrl.replace(/\/api\/v1\/?$/, '') || window.location.origin;
    if (value.startsWith('/')) {
      return `${apiOrigin}${value}`;
    }
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.pathname.startsWith('/images/proof/')) {
        return parsed.toString();
      }
    } catch {
      // Ignore invalid URL and fall back to raw value.
    }
    return value;
  }

  onProofImageError(): void {
    this.proofImageFailed = true;
  }

  formatAddress(address?: ShipperAddress): string {
    if (!address) return 'Chưa có địa chỉ';
    return [address.address, address.communeId?.name, address.provinceId?.name]
      .filter(Boolean)
      .join(', ');
  }

  mapUrl(address?: ShipperAddress): string {
    const destination =
      address?.lat !== undefined && address?.lng !== undefined
        ? `${address.lat},${address.lng}`
        : this.formatAddress(address);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  stateLabel(state: ShipperJob['deliveryState']): string {
    return (
      {
        UNASSIGNED: 'Chưa phân công',
        ASSIGNED: 'Chờ nhận đơn',
        ACCEPTED: 'Đã nhận đơn',
        DELIVERING: 'Đang giao',
        DELIVERED: 'Đã giao',
        FAILED: 'Giao chưa thành công',
      } as const
    )[state];
  }

  private async run(
    request: Observable<unknown>,
    message: string,
    returnToJobs = false,
  ): Promise<void> {
    this.busy = true;
    try {
      await firstValueFrom(request);
      await this.success(message);
      if (returnToJobs) await this.router.navigate(['/shipper/jobs']);
      else this.load();
    } catch (error: any) {
      await this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  private async confirm(title: string, text: string, confirmButtonText: string): Promise<boolean> {
    const result = await Swal.fire({
      title,
      text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: 'Hủy',
    });
    return result.isConfirmed;
  }

  private success(title: string): Promise<any> {
    return Swal.fire({
      toast: true,
      position: 'top',
      icon: 'success',
      title,
      showConfirmButton: false,
      timer: 1800,
    });
  }

  private showError(error: any, fallback = 'Vui lòng kiểm tra kết nối và thử lại.'): Promise<any> {
    return Swal.fire(
      'Không thể cập nhật',
      error?.error?.message || error?.message || fallback,
      'error',
    );
  }

  private async optionalLocation(): Promise<{ lat?: number; lng?: number }> {
    try {
      const position = await this.currentPosition();
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      return {};
    }
  }

  private currentPosition(): Promise<GeolocationPosition> {
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
