import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-card-payment-modal',
  standalone: true,
  imports: [], // không cần import gì vì dùng Bootstrap class thuần
  templateUrl: './card-payment-modal.component.html',
  styles: [`
    .card-icon { font-size: 3rem; color: #0d6efd; }
    .form-control-lg { height: 52px; font-size: 1.1rem; }
  `]
})
export class CardPaymentModalComponent {
  @Input() amount: number = 0;
  @Output() confirm = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  cardData = {
    card_number: '4242424242424242',
    card_holder_name: 'Test User',
    expiryMonth: '12',
    expiryYear: '2025',
    cvv: '123'
  };

  onSubmit() {
    if (this.cardData.card_number.replace(/\s/g,'').length !== 16) {
      alert('Số thẻ phải có 16 số');
      return;
    }
    this.confirm.emit(this.cardData);
  }
}