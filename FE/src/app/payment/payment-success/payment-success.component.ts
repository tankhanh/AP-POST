import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './payment-success.html',
})
export class PaymentSuccessComponent implements OnInit {
  status: string = '';
  msg: string = '';
  waybill: string = '';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.status = params['status'] || 'failed';
      this.msg = decodeURIComponent(params['msg'] || '');
      this.waybill = localStorage.getItem('waybill') || 'N/A';
    });
  }

  goHome(): void {
    localStorage.removeItem('waybill');
    this.router.navigate(['/employee/order/create']);
  }
}