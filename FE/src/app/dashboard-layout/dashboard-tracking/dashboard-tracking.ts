import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-steps-demo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-tracking.html',
  styleUrls: ['./dashboard-tracking.scss'],
})
export class TrackingComponent {
  activeIndex: number = 0;

  items = [{ label: 'Pending' }, { label: 'Shipping' }, { label: 'Complete' }, { label: 'Refund' }];

  onActiveIndexChange(index: number) {
    this.activeIndex = index;
  }
}
