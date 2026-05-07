import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-success.component.html',
})
export class PaymentSuccessComponent implements OnInit {
  orderId: string = '';
  resultCode: number = -1;
  isSuccess: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    // Đọc query params từ URL
    this.orderId =
      this.route.snapshot.queryParamMap.get('orderId') ||
      this.route.snapshot.queryParamMap.get('orderid') ||
      ''; // MoMo đôi khi trả về orderid

    const resultCodeStr = this.route.snapshot.queryParamMap.get('resultCode');
    this.resultCode = resultCodeStr ? Number(resultCodeStr) : -1;

    this.isSuccess = this.resultCode === 0;

    console.log('📥 Payment Success Page - OrderId:', this.orderId, 'ResultCode:', this.resultCode);

    // Nếu thành công thì cập nhật trạng thái (để chắc ăn)
    if (this.isSuccess && this.orderId) {
      // Bạn có thể gọi API cập nhật lại nếu cần
      console.log(`✅ Thanh toán thành công cho đơn: ${this.orderId}`);
    }

    // Tự động chuyển về danh sách sau 4 giây
    setTimeout(() => {
      this.goToList();
    }, 4000);
  }

  goToList() {
    const base = this.authService.isCustomer() ? '/customer' : this.authService.isEmployee() ? '/employee' : '/admin';
    this.router.navigate([`${base}/orders/list`]);
  }
}
