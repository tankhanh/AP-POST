import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationsService } from '../../../services/notifications.service';

@Component({
  selector: 'app-notifications-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-4">
      <h3>Send Test Notification</h3>
      <form (ngSubmit)="send()">
        <div class="mb-2">
          <label>Recipient (userId or email)</label>
          <input class="form-control" [(ngModel)]="recipient" name="recipient" required />
        </div>
        <div class="mb-2">
          <label>Title</label>
          <input class="form-control" [(ngModel)]="title" name="title" required />
        </div>
        <div class="mb-2">
          <label>Message</label>
          <textarea class="form-control" [(ngModel)]="message" name="message"></textarea>
        </div>
        <div class="mb-2">
          <label>Related Order Id (optional)</label>
          <input class="form-control" [(ngModel)]="relatedOrderId" name="relatedOrderId" />
        </div>
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
      <div *ngIf="response" class="mt-3 alert alert-success">Sent: {{ response | json }}</div>
    </div>
  `,
})
export class NotificationsTest {
  recipient = '';
  title = 'Test Notification';
  message = 'This is a test.';
  relatedOrderId = '';
  response: any = null;

  constructor(private svc: NotificationsService) {}

  send() {
    const payload: any = {
      recipient: this.recipient,
      title: this.title,
      message: this.message,
      type: 'PUSH',
    };
    if (this.relatedOrderId) payload.relatedOrderId = this.relatedOrderId;
    this.svc.create(payload).subscribe((res) => (this.response = res));
  }
}
