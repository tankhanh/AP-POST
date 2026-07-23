import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { env } from '../environments/environment';

export interface PendingOnlinePayment {
  method: 'MOMO';
  transactionCode: string;
  orderId: string;
  expiresAt?: string;
  savedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentRecoveryService {
  private readonly storageKey = 'ap_post_pending_online_payment';

  constructor(private readonly http: HttpClient) {}

  remember(payment: PendingOnlinePayment): void {
    if (!payment?.transactionCode || payment.method !== 'MOMO') return;
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({ ...payment, savedAt: new Date().toISOString() }),
    );
  }

  current(): PendingOnlinePayment | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const payment = JSON.parse(raw) as PendingOnlinePayment;
      if (!payment.transactionCode || payment.method !== 'MOMO') {
        this.clear();
        return null;
      }
      const savedAt = payment.savedAt ? new Date(payment.savedAt).getTime() : Date.now();
      if (Date.now() - savedAt > 7 * 24 * 60 * 60_000) {
        this.clear();
        return null;
      }
      if (payment.expiresAt) {
        const expiresAt = new Date(payment.expiresAt).getTime();
        if (Date.now() > expiresAt) {
          this.clear();
          return null;
        }
      }
      return payment;
    } catch {
      this.clear();
      return null;
    }
  }

  clear(transactionCode?: string): void {
    const current = this.currentWithoutCleanup();
    if (!transactionCode || current?.transactionCode === transactionCode) {
      localStorage.removeItem(this.storageKey);
    }
  }

  status(payment: PendingOnlinePayment, reconcile = false): Observable<any> {
    const params = reconcile
      ? new HttpParams().set('reconcile', 'true')
      : new HttpParams();
    const path = `payments/momo/status/${encodeURIComponent(payment.transactionCode)}`;
    return this.http.get(`${env.baseUrl}/${path}`, { params });
  }

  retry(payment: PendingOnlinePayment): Observable<any> {
    const path = 'payments/momo/retry';
    return this.http.post(`${env.baseUrl}/${path}`, {
      transactionCode: payment.transactionCode,
    });
  }

  unwrap(response: any): any {
    const first = response?.data ?? response;
    return first?.data ?? first;
  }

  private currentWithoutCleanup(): PendingOnlinePayment | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as PendingOnlinePayment) : null;
    } catch {
      return null;
    }
  }
}
