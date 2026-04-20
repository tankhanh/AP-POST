import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { VnpayService } from '../../services/vnpay.service';
import { VNPayReturnStatus, Payment, Order } from '../../types/payment.types';

@Component({
  selector: 'app-vnpay-return',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vnpay-return.component.html',
  styleUrls: ['./vnpay-return.component.css'],
})
export class VnpayReturnComponent implements OnInit {
  status: VNPayReturnStatus = 'loading';
  message: string = '';
  transactionCode: string = '';
  amount: number = 0;
  responseCode: string = '';
  orderId: string = '';
  paymentDetails: (Payment & { order?: Order }) | null = null;
  orderInfo: Order | null = null;
  isLoadingDetails = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private vnpayService: VnpayService,
  ) {}

  ngOnInit() {
    // Get query parameters from return URL
    this.route.queryParams.subscribe((params) => {
      this.status = (params['status'] || 'error') as any;
      this.message = params['message'] || '';
      this.transactionCode = params['transactionCode'] || '';
      this.amount = parseInt(params['amount']) || 0;
      this.responseCode = params['responseCode'] || '';
      this.orderId = params['orderId'] || '';

      // Fetch payment details if transaction code available
      if (this.transactionCode) {
        this.fetchPaymentDetails();
      }
    });
  }

  /**
   * Fetch payment details from backend
   */
  fetchPaymentDetails() {
    if (!this.transactionCode) return;

    this.isLoadingDetails = true;

    this.vnpayService.getPaymentDetails(this.transactionCode).subscribe({
      next: (response) => {
        if (response.success) {
          this.paymentDetails = response.data;
        }
        this.isLoadingDetails = false;
      },
      error: (err) => {
        console.error('Failed to fetch payment details:', err);
        this.isLoadingDetails = false;
      },
    });
  }

  /**
   * Return to order list
   */
  goToDashboard() {
    this.router.navigate(['/employee/orders/list']);
  }

  /**
   * Retry payment
   */
  retryPayment() {
    const id = this.paymentDetails?.orderId || this.orderId;
    if (id) {
      this.router.navigate(['/payment/vnpay'], {
        queryParams: { orderId: id },
      });
    }
  }

  /**
   * Get status badge class
   */
  getStatusClass(): string {
    switch (this.status) {
      case 'success':
        return 'badge bg-success';
      case 'failed':
        return 'badge bg-danger';
      case 'error':
        return 'badge bg-warning';
      default:
        return 'badge bg-secondary';
    }
  }

  /**
   * Get status icon
   */
  getStatusIcon(): string {
    switch (this.status) {
      case 'success':
        return '✓';
      case 'failed':
        return '✕';
      case 'error':
        return '!';
      default:
        return '...';
    }
  }
}
