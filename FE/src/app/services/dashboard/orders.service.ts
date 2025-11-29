import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';
import { env } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly API_URL = `${env.baseUrl}/orders`;
  private readonly PRICING_URL = `${env.baseUrl}/pricing/calculate`;

  constructor(private http: HttpClient) {}

  private getHeaders() {
    const token = localStorage.getItem('access_token') || '';
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * TẠO ORDER – PHIÊN BẢN ĐÃ FIX LOADING TREO 100%
   */
  createOrder(data: any): Observable<any> {
    return this.http
      .post<any>(`${this.API_URL}`, data, {
        headers: this.getHeaders(),
        observe: 'response', // ← QUAN TRỌNG: lấy full HTTP response
        withCredentials: true, // nếu bạn dùng cookie (không bắt buộc)
      })
      .pipe(
        map((response: HttpResponse<any>) => response.body ?? { success: true }),
        catchError((err) => {
          console.error('Create order error:', err);
          return throwError(() => err);
        })
      );
  }

  // ==================== CÁC HÀM KHÁC GIỮ NGUYÊN, CHỈ THÊM observe nếu muốn chắc ăn hơn ====================

  getOrders(filters: any = {}): Observable<any> {
    let params = new HttpParams().set('pageSize', '999').set('current', '1');

    for (const key in filters) {
      if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
        const value = Array.isArray(filters[key]) ? filters[key].join(',') : filters[key];
        params = params.set(key, value);
      }
    }

    return this.http.get<any>(`${this.API_URL}`, {
      headers: this.getHeaders(),
      params,
    });
  }

  getOrderById(id: string): Observable<any> {
    return this.http.get(`${this.API_URL}/${id}`, { headers: this.getHeaders() });
  }

  updateOrder(id: string, data: any): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}`, data, { headers: this.getHeaders() });
  }

  deleteOrder(id: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`, { headers: this.getHeaders() });
  }

  updateStatus(id: string, status: string): Observable<any> {
    return this.http.patch(
      `${this.API_URL}/${id}/status/${status}`,
      {},
      { headers: this.getHeaders() }
    );
  }

  calculateShippingFee(payload: {
    originProvinceCode: string;
    destProvinceCode: string;
    serviceCode: 'STD' | 'EXP';
    weightKg: number;
    isLocal: boolean;
  }): Observable<any> {
    return this.http.post(this.PRICING_URL, payload, { headers: this.getHeaders() });
  }

  resendWelcomeEmail(orderId: string) {
    return this.http.post(
      `${this.API_URL}/${orderId}/resend-email`,
      {},
      { headers: this.getHeaders() }
    );
  }
}
