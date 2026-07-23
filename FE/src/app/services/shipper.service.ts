import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { env } from '../environments/environment';

export type ShipperJobsView = 'active' | 'assigned' | 'failed' | 'history' | 'all';

export interface ShipperAddress {
  address?: string;
  lat?: number;
  lng?: number;
  communeId?: { name?: string };
  provinceId?: { name?: string };
}

export interface ShipperJob {
  _id: string;
  waybill: string;
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'COMPLETED' | 'CANCELED';
  deliveryState: 'UNASSIGNED' | 'ASSIGNED' | 'ACCEPTED' | 'DELIVERING' | 'DELIVERED' | 'FAILED';
  senderName: string;
  senderPhone?: string;
  receiverName: string;
  receiverPhone: string;
  serviceCode?: string;
  weightKg?: number;
  codValue?: number;
  receiverPayAmount?: number;
  shippingFee?: number;
  details?: string;
  pickupAddressId?: ShipperAddress;
  deliveryAddressId?: ShipperAddress;
  deliveryFailureReason?: string;
  deliveryAttempts?: number;
  proofOfDeliveryUrl?: string;
  recipientConfirmedName?: string;
  deliveryNote?: string;
  assignedAt?: string;
  assignmentExpiresAt?: string;
  assignmentRejectedAt?: string;
  assignmentRejectionReason?: string;
  assignmentMode?: 'MANUAL' | 'AUTO';
  acceptedAt?: string;
  deliveryStartedAt?: string;
  deliveredAt?: string;
  lastDeliveryLocation?: { lat: number; lng: number; updatedAt: string };
  assignedShipperId?: { _id?: string; name?: string; phone?: string } | string | null;
  branchId?: { _id?: string; name?: string } | string | null;
}

export interface ShipperSummary {
  assigned: number;
  delivering: number;
  failed: number;
  completedToday: number;
  totalCompleted: number;
  codToCollect: number;
  shippingFees: number;
}

export interface ShipperJobsPage {
  meta: { current: number; pageSize: number; pages: number; total: number };
  results: ShipperJob[];
}

export interface ActiveShipper {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  activeJobs?: number;
  isOnline?: boolean;
  lastSeenAt?: string;
  isAvailable?: boolean;
  branchId?: { _id?: string; name?: string } | string;
  vehicleType?: 'MOTORBIKE' | 'CAR' | 'VAN';
  licensePlate?: string;
}

export interface AutoDispatchResult {
  assigned: boolean;
  reason?: string;
  shipperId?: string;
  order?: ShipperJob;
}

export interface AutoDispatchQueueResult {
  processed: number;
  assigned: number;
  pending: number;
  results: Array<{
    orderId: string;
    waybill: string;
    assigned: boolean;
    reason?: string;
    shipperId?: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ShipperService {
  private readonly ordersUrl = `${env.baseUrl}/orders`;

  constructor(private readonly http: HttpClient) {}

  getSummary(): Observable<ShipperSummary> {
    return this.http
      .get<any>(`${this.ordersUrl}/shipper/summary`)
      .pipe(map((response) => response?.data ?? response));
  }

  getJobs(
    view: ShipperJobsView = 'active',
    search = '',
    current = 1,
    pageSize = 12,
  ): Observable<ShipperJobsPage> {
    const params = new HttpParams()
      .set('current', String(current))
      .set('pageSize', String(pageSize))
      .set('view', view)
      .set('search', search);
    return this.http
      .get<any>(`${this.ordersUrl}/shipper/jobs`, { params })
      .pipe(map((response) => response?.data ?? response));
  }

  getJob(orderId: string): Observable<ShipperJob> {
    return this.http
      .get<unknown>(`${this.ordersUrl}/${encodeURIComponent(orderId)}`)
      .pipe(map((response) => this.unwrap<ShipperJob>(response)));
  }

  accept(orderId: string): Observable<any> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/shipper/accept`, {});
  }

  reject(orderId: string, reason: string): Observable<any> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/shipper/reject`, { reason });
  }

  start(orderId: string): Observable<any> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/shipper/start`, {});
  }

  complete(orderId: string, payload: any): Observable<any> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/shipper/complete`, payload);
  }

  fail(orderId: string, payload: any): Observable<any> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/shipper/fail`, payload);
  }

  retry(orderId: string): Observable<unknown> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/shipper/retry`, {});
  }

  updateLocation(orderId: string, lat: number, lng: number): Observable<any> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/shipper/location`, { lat, lng });
  }

  uploadProof(file: File): Observable<string> {
    const form = new FormData();
    form.append('fileUpload', file);
    return this.http
      .post<any>(`${env.baseUrl}/files/upload`, form, {
        headers: { folder_type: 'proof' },
      })
      .pipe(
        map((response) => {
          const fileName = response?.data?.fileName ?? response?.fileName;
          const publicPath = response?.data?.publicPath ?? response?.publicPath;
          if (typeof publicPath === 'string' && publicPath.startsWith('/images/proof/')) {
            return publicPath;
          }
          if (!fileName) throw new Error('Máy chủ không trả về tên ảnh đã tải lên.');
          return `/images/proof/${encodeURIComponent(fileName)}`;
        }),
      );
  }

  getDispatchOrders(): Observable<ShipperJob[]> {
    const params = new HttpParams()
      .set('current', '1')
      .set('pageSize', '100')
      .set('status', 'CONFIRMED,SHIPPING');
    return this.http.get<unknown>(this.ordersUrl, { params }).pipe(
      map((response) => {
        const page = this.unwrap<{ results?: ShipperJob[] }>(response);
        return page.results ?? [];
      }),
    );
  }

  getActiveShippers(): Observable<ActiveShipper[]> {
    return this.http
      .get<unknown>(`${env.baseUrl}/users/shippers/active`)
      .pipe(map((response) => this.unwrap<ActiveShipper[]>(response)));
  }

  assign(orderId: string, shipperId: string): Observable<unknown> {
    return this.http.patch(`${this.ordersUrl}/${orderId}/assign-shipper`, { shipperId });
  }

  autoAssign(orderId: string): Observable<AutoDispatchResult> {
    return this.http
      .patch<unknown>(`${this.ordersUrl}/${orderId}/auto-assign-shipper`, {})
      .pipe(map((response) => this.unwrap<AutoDispatchResult>(response)));
  }

  autoAssignQueue(): Observable<AutoDispatchQueueResult> {
    return this.http
      .patch<unknown>(`${this.ordersUrl}/dispatch/auto-assign`, {})
      .pipe(map((response) => this.unwrap<AutoDispatchQueueResult>(response)));
  }

  unassign(orderId: string): Observable<unknown> {
    return this.http.delete(`${this.ordersUrl}/${orderId}/shipper`);
  }

  private unwrap<T>(response: unknown): T {
    const wrapped = response as { data?: T };
    return (wrapped?.data ?? response) as T;
  }
}
