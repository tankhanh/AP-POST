import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './payment-success.component.html',
})
export class PaymentSuccessComponent implements OnInit {
  orderId: string | null = null;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.orderId = this.route.snapshot.queryParamMap.get('orderId');

    // Auto redirect sau 3 giây
    setTimeout(() => {
      this.goToList();
    }, 3000);
  }

  goToList() {
    this.router.navigate(['/employee/orders/list']);
  }
}