import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import { BranchService } from '../../services/branch.service';
import { StaffService } from '../../services/staff.service';
import { ActiveShipper, ShipperJob, ShipperService } from '../../services/shipper.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-admin-shipper-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-shipper-management.html',
  styleUrl: './admin-shipper-management.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdminShipperManagement implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  shippers: any[] = [];
  branches: any[] = [];
  dispatchOrders: ShipperJob[] = [];
  activeShippers: ActiveShipper[] = [];
  readonly shipperSelections: Record<string, string> = {};
  keyword = '';
  loading = false;
  saving = false;
  loadingDispatch = false;
  busyOrderId = '';
  autoAssigningQueue = false;
  formOpen = false;
  editingId = '';
  private presenceSubscription?: Subscription;
  private dispatchSubscription?: Subscription;
  private presenceRefreshTimer?: ReturnType<typeof setInterval>;
  private dispatchRefreshTimer?: ReturnType<typeof setTimeout>;
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{9,15}$/)]],
    branchId: ['', Validators.required],
    isActive: [true],
    isAvailable: [true],
    vehicleType: ['MOTORBIKE'],
    licensePlate: ['', [Validators.pattern(/^[A-Za-z0-9.-]{5,15}$/)]],
    password: ['', [Validators.minLength(8)]],
  });

  constructor(
    private readonly staffService: StaffService,
    private readonly branchService: BranchService,
    private readonly shipperService: ShipperService,
    private readonly socketService: SocketService,
  ) {}

  ngOnInit(): void {
    void Promise.all([this.loadShippers(), this.loadBranches(), this.loadDispatch()]);
    this.socketService.connect();
    this.presenceSubscription = this.socketService
      .on('shipper:presence')
      .subscribe((presence: { shipperId?: string; isOnline?: boolean; lastSeenAt?: string }) => {
        if (!presence?.shipperId) return;
        this.patchPresence(this.shippers, presence);
        this.patchPresence(this.activeShippers, presence);
      });
    this.dispatchSubscription = this.socketService.on('notification').subscribe((notification) => {
      if (!notification?.relatedOrderId) return;
      if (this.dispatchRefreshTimer) clearTimeout(this.dispatchRefreshTimer);
      this.dispatchRefreshTimer = setTimeout(() => void this.loadDispatch(), 400);
    });
    this.presenceRefreshTimer = setInterval(() => void this.loadShippers(true), 60_000);
  }

  ngOnDestroy(): void {
    this.presenceSubscription?.unsubscribe();
    this.dispatchSubscription?.unsubscribe();
    if (this.presenceRefreshTimer) clearInterval(this.presenceRefreshTimer);
    if (this.dispatchRefreshTimer) clearTimeout(this.dispatchRefreshTimer);
  }

  get filteredShippers() {
    const keyword = this.keyword.trim().toLowerCase();
    if (!keyword) return this.shippers;
    return this.shippers.filter((shipper) =>
      [shipper.name, shipper.email, shipper.phone, shipper.branchId?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }

  async loadShippers(silent = false) {
    if (!silent) this.loading = true;
    try {
      const response: any = await this.staffService.findAll('SHIPPER');
      this.shippers =
        response?.data?.result ??
        response?.data?.results ??
        response?.result ??
        response?.data ??
        [];
    } catch (error: any) {
      await Swal.fire(
        'Không thể tải shipper',
        error?.error?.message || 'Vui lòng thử lại.',
        'error',
      );
    } finally {
      if (!silent) this.loading = false;
    }
  }

  async loadBranches() {
    try {
      const response: any = await this.branchService.findAll();
      this.branches = response?.data?.results ?? response?.data ?? [];
    } catch {
      this.branches = [];
    }
  }

  openCreate() {
    this.editingId = '';
    this.form.reset({
      name: '',
      email: '',
      phone: '',
      branchId: '',
      isActive: true,
      isAvailable: true,
      vehicleType: 'MOTORBIKE',
      licensePlate: '',
      password: '',
    });
    this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.controls.password.updateValueAndValidity();
    this.formOpen = true;
  }

  openEdit(shipper: any) {
    this.editingId = shipper._id;
    this.form.reset({
      name: shipper.name || '',
      email: shipper.email || '',
      phone: shipper.phone || '',
      branchId: shipper.branchId?._id || shipper.branchId || '',
      isActive: shipper.isActive !== false,
      isAvailable: shipper.isAvailable !== false,
      vehicleType: shipper.vehicleType || 'MOTORBIKE',
      licensePlate: shipper.licensePlate || '',
      password: '',
    });
    this.form.controls.password.clearValidators();
    this.form.controls.password.updateValueAndValidity();
    this.formOpen = true;
  }

  closeForm() {
    if (this.saving) return;
    this.formOpen = false;
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const value = this.form.getRawValue();
    try {
      if (this.editingId) {
        const { password: _password, ...payload } = value;
        await this.staffService.update(this.editingId, { ...payload, role: 'SHIPPER' });
      } else {
        await this.staffService.create({ ...value, role: 'SHIPPER' });
      }
      this.formOpen = false;
      await this.loadShippers();
      await this.loadDispatch();
      await Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: this.editingId ? 'Đã cập nhật shipper' : 'Đã tạo tài khoản shipper',
        showConfirmButton: false,
        timer: 1800,
      });
    } catch (error: any) {
      await Swal.fire(
        'Không thể lưu',
        error?.error?.message || 'Vui lòng kiểm tra dữ liệu.',
        'error',
      );
    } finally {
      this.saving = false;
    }
  }

  async remove(shipper: any) {
    const result = await Swal.fire({
      title: 'Ngừng tài khoản shipper?',
      text: `${shipper.name} sẽ không thể đăng nhập hoặc nhận đơn mới.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Chuyển vào thùng rác',
      cancelButtonText: 'Hủy',
    });
    if (!result.isConfirmed) return;
    try {
      await this.staffService.delete(shipper._id);
      await this.loadShippers();
    } catch (error: any) {
      await Swal.fire('Không thể xóa', error?.error?.message || 'Vui lòng thử lại.', 'error');
    }
  }

  async loadDispatch() {
    this.loadingDispatch = true;
    try {
      const [orders, shippers] = await Promise.all([
        firstValueFrom(this.shipperService.getDispatchOrders()),
        firstValueFrom(this.shipperService.getActiveShippers()),
      ]);
      this.dispatchOrders = orders.filter((order) => order.deliveryState !== 'DELIVERED');
      this.activeShippers = shippers;
      for (const order of this.dispatchOrders) {
        const assigned = order.assignedShipperId;
        this.shipperSelections[order._id] =
          typeof assigned === 'string' ? assigned : assigned?._id || '';
      }
    } catch (error: any) {
      await Swal.fire(
        'Không thể tải bàn điều phối',
        error?.error?.message || 'Vui lòng thử lại.',
        'error',
      );
    } finally {
      this.loadingDispatch = false;
    }
  }

  availableShippers(order: ShipperJob): ActiveShipper[] {
    const branch = (order as any).branchId;
    const orderBranchId = typeof branch === 'string' ? branch : branch?._id;
    const matching = !orderBranchId
      ? this.activeShippers
      : this.activeShippers.filter((shipper) => {
      const shipperBranch = shipper.branchId;
      const shipperBranchId =
        typeof shipperBranch === 'string' ? shipperBranch : shipperBranch?._id;
      return shipperBranchId === orderBranchId;
    });
    return [...matching].sort(
      (left, right) =>
        Number(Boolean(right.isOnline)) - Number(Boolean(left.isOnline)) ||
        Number(left.activeJobs || 0) - Number(right.activeJobs || 0),
    );
  }

  presenceLabel(shipper: any): string {
    if (shipper.isActive === false) return 'Tài khoản khóa';
    return shipper.isOnline ? 'Trực tuyến' : 'Ngoại tuyến';
  }

  lastSeenLabel(shipper: any): string {
    if (shipper.isOnline) return 'Đang kết nối';
    if (!shipper.lastSeenAt) return 'Chưa ghi nhận đăng nhập';
    return `Lần cuối ${new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(shipper.lastSeenAt))}`;
  }

  private patchPresence(
    collection: any[],
    presence: { shipperId?: string; isOnline?: boolean; lastSeenAt?: string },
  ): void {
    if (!presence.shipperId) return;
    const shipper = collection.find((item) => String(item._id) === String(presence.shipperId));
    if (!shipper) return;
    shipper.isOnline = Boolean(presence.isOnline);
    shipper.lastSeenAt = presence.lastSeenAt;
  }

  async assignOrder(order: ShipperJob) {
    const shipperId = this.shipperSelections[order._id];
    if (!shipperId) {
      await Swal.fire('Chưa chọn shipper', 'Hãy chọn người phụ trách đơn giao.', 'warning');
      return;
    }
    const selectedShipper = this.activeShippers.find((shipper) => shipper._id === shipperId);
    if (selectedShipper && !selectedShipper.isOnline) {
      const confirmation = await Swal.fire({
        title: 'Shipper đang ngoại tuyến',
        text: 'Bạn vẫn có thể phân công thủ công, nhưng shipper có thể phản hồi chậm hoặc hết hạn nhận đơn.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Vẫn phân công',
        cancelButtonText: 'Chọn lại',
      });
      if (!confirmation.isConfirmed) return;
    }
    this.busyOrderId = order._id;
    try {
      await firstValueFrom(this.shipperService.assign(order._id, shipperId));
      await this.loadDispatch();
      await Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: `Đã phân công đơn ${order.waybill}`,
        showConfirmButton: false,
        timer: 1600,
      });
    } catch (error: any) {
      await Swal.fire('Không thể phân công', error?.error?.message || 'Vui lòng thử lại.', 'error');
    } finally {
      this.busyOrderId = '';
    }
  }

  async autoAssignOrder(order: ShipperJob) {
    this.busyOrderId = order._id;
    try {
      const result = await firstValueFrom(this.shipperService.autoAssign(order._id));
      await this.loadDispatch();
      if (result.assigned) {
        await Swal.fire({
          toast: true,
          position: 'top',
          icon: 'success',
          title: `Đã tự động phân công đơn ${order.waybill}`,
          showConfirmButton: false,
          timer: 1800,
        });
      } else {
        await Swal.fire(
          'Chưa thể tự động phân công',
          result.reason || 'Hiện chưa có shipper phù hợp. Đơn vẫn ở hàng chờ và hệ thống sẽ thử lại.',
          'info',
        );
      }
    } catch (error: any) {
      await Swal.fire(
        'Không thể tự động phân công',
        error?.error?.message || 'Vui lòng thử lại.',
        'error',
      );
    } finally {
      this.busyOrderId = '';
    }
  }

  async autoAssignQueue() {
    const confirmation = await Swal.fire({
      title: 'Tự động điều phối hàng chờ?',
      text: 'Hệ thống sẽ chọn shipper theo chi nhánh, trạng thái trực tuyến, sức chứa phương tiện và tải công việc.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Bắt đầu điều phối',
      cancelButtonText: 'Hủy',
    });
    if (!confirmation.isConfirmed) return;

    this.autoAssigningQueue = true;
    try {
      const result = await firstValueFrom(this.shipperService.autoAssignQueue());
      await this.loadDispatch();
      await Swal.fire({
        icon: result.pending ? 'info' : 'success',
        title: 'Đã xử lý hàng chờ',
        html: `<strong>${result.assigned}</strong> đơn đã được đề nghị cho shipper.<br><strong>${result.pending}</strong> đơn tiếp tục chờ ứng viên phù hợp.`,
        confirmButtonText: 'Đã hiểu',
      });
    } catch (error: any) {
      await Swal.fire(
        'Không thể điều phối hàng chờ',
        error?.error?.message || 'Vui lòng thử lại.',
        'error',
      );
    } finally {
      this.autoAssigningQueue = false;
    }
  }

  async unassignOrder(order: ShipperJob) {
    const confirmed = await Swal.fire({
      title: 'Hủy phân công?',
      text: `Đơn ${order.waybill} sẽ quay lại hàng chờ điều phối.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Hủy phân công',
      cancelButtonText: 'Giữ nguyên',
    });
    if (!confirmed.isConfirmed) return;
    this.busyOrderId = order._id;
    try {
      await firstValueFrom(this.shipperService.unassign(order._id));
      await this.loadDispatch();
    } catch (error: any) {
      await Swal.fire(
        'Không thể hủy phân công',
        error?.error?.message || 'Vui lòng thử lại.',
        'error',
      );
    } finally {
      this.busyOrderId = '';
    }
  }

  stateLabel(state: string): string {
    return (
      (
        {
          UNASSIGNED: 'Chưa phân công',
          ASSIGNED: 'Chờ shipper nhận',
          ACCEPTED: 'Shipper đã nhận',
          DELIVERING: 'Đang giao',
          FAILED: 'Cần xử lý lại',
        } as Record<string, string>
      )[state] || state
    );
  }

  assignmentModeLabel(order: ShipperJob): string {
    return order.assignmentMode === 'AUTO' ? 'Tự động' : 'Thủ công';
  }

  branchLabel(order: ShipperJob): string {
    const branch = order.branchId;
    if (typeof branch === 'string') return 'Đã xác định bưu cục';
    return branch?.name || 'Sẽ tự xác định từ nơi lấy hàng';
  }

  canAssign(order: ShipperJob): boolean {
    return ['UNASSIGNED', 'ASSIGNED', 'FAILED'].includes(order.deliveryState);
  }

  canAutoAssign(order: ShipperJob): boolean {
    return ['UNASSIGNED', 'FAILED'].includes(order.deliveryState);
  }

  canUnassign(order: ShipperJob): boolean {
    return (
      Boolean(order.assignedShipperId) &&
      ['ASSIGNED', 'ACCEPTED', 'FAILED'].includes(order.deliveryState)
    );
  }
}
