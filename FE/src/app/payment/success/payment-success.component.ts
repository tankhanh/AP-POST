import { Component, OnInit } from '@angular/core';
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.orderId = this.route.snapshot.queryParamMap.get('orderId') || '';
    this.resultCode = Number(this.route.snapshot.queryParamMap.get('resultCode')) || -1;

    // Auto redirect sau 3 giây
    setTimeout(() => {
      this.goToList();
    }, 3000);
  }

  goToList() {
    this.router.navigate(['/employee/orders/list']);
  }
}
