import { Component, OnDestroy, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { env } from '../../environments/environment';
import {
  PaymentRecoveryService,
  PendingOnlinePayment,
} from '../../services/payment-recovery.service';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-success.component.html',
})
export class PaymentSuccessComponent implements OnInit, OnDestroy {
  orderId: string = '';
  resultCode: number = -1;
  paymentMethod: 'MOMO' = 'MOMO';
  isSuccess: boolean = false;
  isProcessing = true;
  private pollTimer?: number;
  private redirectTimer?: number;
  private attempts = 0;
  private pendingPayment?: PendingOnlinePayment;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private paymentRecovery: PaymentRecoveryService,
  ) {}

  ngOnInit() {
    // Đọc query params từ URL
    this.orderId =
      this.route.snapshot.queryParamMap.get('transactionCode') ||
      this.route.snapshot.queryParamMap.get('orderId') ||
      this.route.snapshot.queryParamMap.get('orderid') ||
      ''; // MoMo đôi khi trả về orderid

    const resultCodeStr = this.route.snapshot.queryParamMap.get('resultCode');
    this.resultCode = resultCodeStr ? Number(resultCodeStr) : -1;

    if (!this.orderId) {
      this.isProcessing = false;
      return;
    }
    this.paymentMethod = 'MOMO';
    this.pendingPayment =
      this.paymentRecovery.current() ?? {
        method: this.paymentMethod,
        transactionCode: this.orderId,
        orderId: this.orderId,
      };
    this.pollStatus();
  }

  goToList() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/tracking']);
      return;
    }
    const base = this.authService.isCustomer()
      ? '/customer'
      : this.authService.isEmployee()
        ? '/employee'
        : '/admin';
    this.router.navigate([`${base}/orders/list`]);
  }

  private pollStatus() {
    if (this.attempts >= 15) {
      this.isProcessing = false;
      this.scheduleRedirect();
      return;
    }
    this.attempts += 1;
    const reconcile = this.attempts === 1 || this.attempts === 8;
    const path = `payments/momo/status/${encodeURIComponent(this.orderId)}`;
    this.http
      .get<any>(`${env.baseUrl}/${path}`, {
        params: reconcile ? { reconcile: 'true' } : {},
      })
      .subscribe({
        next: (response) => {
          const payment = response?.data ?? response;
          if (payment.status === 'paid') {
            this.isSuccess = true;
            this.isProcessing = false;
            this.paymentRecovery.clear(this.orderId);
            this.scheduleRedirect();
            return;
          }
          if (payment.status === 'failed') {
            this.isProcessing = false;
            return;
          }
          this.pollTimer = window.setTimeout(() => this.pollStatus(), 2000);
        },
        error: () => {
          this.pollTimer = window.setTimeout(() => this.pollStatus(), 2000);
        },
      });
  }

  retryPayment(): void {
    if (!this.pendingPayment || this.isProcessing) return;
    this.isProcessing = true;
    this.paymentRecovery.retry(this.pendingPayment).subscribe({
      next: (response) => {
        const result = this.paymentRecovery.unwrap(response);
        const paymentUrl = result?.payUrl ?? result?.paymentUrl;
        if (!paymentUrl || !result?.transactionCode) {
          this.isProcessing = false;
          return;
        }
        this.paymentRecovery.remember({
          method: this.pendingPayment!.method,
          transactionCode: result.transactionCode,
          orderId: String(result.orderId ?? this.pendingPayment!.orderId),
          expiresAt: result.expiresAt,
        });
        window.location.assign(paymentUrl);
      },
      error: () => (this.isProcessing = false),
    });
  }

  private scheduleRedirect() {
    this.redirectTimer = window.setTimeout(() => this.goToList(), 6000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) window.clearTimeout(this.pollTimer);
    if (this.redirectTimer) window.clearTimeout(this.redirectTimer);
  }
}
