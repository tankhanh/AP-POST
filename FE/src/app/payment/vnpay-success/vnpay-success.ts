import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-vnpay-success',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './vnpay-success.html',
})
export class VnpaySuccessComponent implements OnInit {
  waybill = 'Đang tải...';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    // Lấy mã vận đơn từ query param (nếu có)
    this.waybill = this.route.snapshot.queryParamMap.get('orderId') || 
                   this.route.snapshot.queryParamMap.get('vnp_TxnRef') || 
                   'BDXXXXXXXXVN';
  }
}