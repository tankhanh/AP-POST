import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  PaymentRecoveryService,
  PendingOnlinePayment,
} from '../../services/payment-recovery.service';

@Component({
  selector: 'app-payment-recovery-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-recovery-banner.html',
  styleUrl: './payment-recovery-banner.css',
})
export class PaymentRecoveryBanner implements OnInit {
  payment: PendingOnlinePayment | null = null;
  visible = false;
  busy = false;
  message = '';

  constructor(
    private readonly recovery: PaymentRecoveryService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.payment = this.recovery.current();
    this.visible = !!this.payment && !this.router.url.startsWith('/payment/');
    if (!this.payment) return;
    this.recovery.status(this.payment, true).subscribe({
      next: (response) => {
        const status = this.recovery.unwrap(response)?.status;
        if (status === 'paid' || status === 'refunded') {
          this.recovery.clear(this.payment?.transactionCode);
          this.visible = false;
        }
      },
      error: () => {
        // The banner is the recovery path itself; a temporary status error
        // must not erase it.
      },
    });
  }

  continuePayment(): void {
    if (!this.payment || this.busy) return;
    this.busy = true;
    this.message = '';
    this.recovery.retry(this.payment).subscribe({
      next: (response) => {
        const result = this.recovery.unwrap(response);
        const paymentUrl = result?.paymentUrl ?? result?.payUrl;
        if (!paymentUrl || !result?.transactionCode) {
          this.busy = false;
          this.message = 'Không thể tạo lại liên kết thanh toán.';
          return;
        }
        this.recovery.remember({
          method: this.payment!.method,
          transactionCode: result.transactionCode,
          orderId: String(result.orderId ?? this.payment!.orderId),
          expiresAt: result.expiresAt,
        });
        window.location.assign(paymentUrl);
      },
      error: (error) => {
        this.busy = false;
        this.message = error?.error?.message || 'Cổng thanh toán đang bận. Vui lòng thử lại.';
      },
    });
  }

  hide(): void {
    this.visible = false;
  }
}
