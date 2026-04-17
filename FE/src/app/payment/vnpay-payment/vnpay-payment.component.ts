import { Component, OnInit, Input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { VnpayService } from '../../services/vnpay.service';
import { ToastrService } from 'ngx-toastr';
import { VNPayCreatePaymentResponse } from '../../types/payment.types';

@Component({
  selector: 'app-vnpay-payment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vnpay-payment.component.html',
  styleUrls: ['./vnpay-payment.component.css'],
})
export class VnpayPaymentComponent implements OnInit {
  @Input() orderId: string = '';

  isLoading = false;
  error: string | null = null;
  paymentUrl: string | null = null;
  transactionCode: string | null = null;
  amount: number = 0;

  constructor(
    private vnpayService: VnpayService,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit() {
    // Get orderId from route params
    this.route.queryParams.subscribe((params) => {
      this.orderId = params['orderId'] || '';
      const amt = params['amount'];
      this.amount = amt ? Number(amt) : 0;
      if (!this.orderId) {
        this.error = 'Order ID is required';
        this.toastr.error('Order ID is missing');
      }
    });
  }

  /**
   * Initiate VNPAY payment
   */
  proceedToVNPay() {
    if (!this.orderId) {
      this.toastr.error('Order ID is missing');
      return;
    }

    this.isLoading = true;
    this.error = null;

    this.vnpayService.createPayment(this.orderId, this.amount || undefined).subscribe({
      next: (res: any) => {
        // Xử lý cả 2 trường hợp: có interceptor hoặc không
        const payload = res.data || res; // ← quan trọng nhất

        if (payload.success) {
          this.paymentUrl = payload.data.paymentUrl;
          this.transactionCode = payload.data.transactionCode;
          this.amount = payload.data.amount;

          this.toastr.info('Đang chuyển hướng đến VNPAY...');

          setTimeout(() => {
            window.location.href = payload.data.paymentUrl;
          }, 800);
        } else {
          this.error = payload.message || 'Failed to create payment';
          this.toastr.error(this.error);
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        const msg =
          err?.error?.data?.message || err?.error?.message || 'Không thể tạo link thanh toán';
        this.error = msg;
        this.toastr.error(msg);
        this.isLoading = false;
      },
    });
  }

  /**
   * Go back to order list
   */
  goBack() {
    this.router.navigate(['/employee/order/list']);
  }
}
