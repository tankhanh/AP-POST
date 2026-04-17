# VNPAY Integration - Quick Start Guide

## Quick Setup Checklist

- [x] VNPAY configuration in `.env`
- [x] VnpayModule imported in AppModule
- [x] VnpayService and VnpayController created
- [x] Payment schema updated
- [x] API endpoints available

## API Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/payment/vnpay/create` | Create payment URL |
| GET | `/payment/vnpay/return` | Handle return from VNPAY |
| POST | `/payment/vnpay/ipn` | Receive IPN callback |
| GET | `/payment/vnpay/:transactionCode` | Get payment details |
| POST | `/payment/vnpay/:transactionCode/cancel` | Cancel payment |

## Frontend Integration Example

### 1. Create Payment and Redirect

```typescript
// payment.service.ts (Frontend - Angular)
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = 'http://localhost:8000/payment/vnpay';

  constructor(private http: HttpClient) {}

  // Create VNPAY payment URL
  createVNPayPayment(orderId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, {
      orderId: orderId
    });
  }

  // Get payment details
  getPaymentDetails(transactionCode: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${transactionCode}`);
  }

  // Cancel payment
  cancelPayment(transactionCode: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${transactionCode}/cancel`, {});
  }
}
```

### 2. Payment Component

```typescript
// payment.component.ts
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentService } from './payment.service';

@Component({
  selector: 'app-payment',
  templateUrl: './payment.component.html',
  styleUrls: ['./payment.component.css']
})
export class PaymentComponent {
  orderId: string;
  isLoading = false;
  error: string | null = null;

  constructor(
    private paymentService: PaymentService,
    private route: ActivatedRoute
  ) {
    this.orderId = this.route.snapshot.queryParams['orderId'];
  }

  proceedToVNPay() {
    if (!this.orderId) {
      this.error = 'Order ID is required';
      return;
    }

    this.isLoading = true;
    this.error = null;

    this.paymentService.createVNPayPayment(this.orderId).subscribe({
      next: (response) => {
        if (response.success) {
          // Redirect to VNPAY payment page
          window.location.href = response.data.paymentUrl;
        } else {
          this.error = response.message || 'Failed to create payment URL';
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'An error occurred';
        this.isLoading = false;
      }
    });
  }
}
```

### 3. Payment Confirmation Page

```typescript
// payment-success.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentService } from './payment.service';

@Component({
  selector: 'app-payment-success',
  templateUrl: './payment-success.component.html'
})
export class PaymentSuccessComponent implements OnInit {
  status: 'success' | 'failed' | 'loading' = 'loading';
  message: string = '';
  transactionCode: string = '';
  amount: number = 0;
  paymentDetails: any = null;

  constructor(
    private route: ActivatedRoute,
    private paymentService: PaymentService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.status = params['status'] || 'loading';
      this.message = params['message'] || '';
      this.transactionCode = params['transactionCode'] || '';
      this.amount = parseInt(params['amount']) || 0;

      // Fetch payment details
      if (this.transactionCode) {
        this.fetchPaymentDetails();
      }
    });
  }

  fetchPaymentDetails() {
    this.paymentService.getPaymentDetails(this.transactionCode).subscribe({
      next: (response) => {
        if (response.success) {
          this.paymentDetails = response.data;
        }
      },
      error: (err) => {
        console.error('Failed to fetch payment details:', err);
      }
    });
  }

  retryPayment() {
    // Navigate back to payment screen
    window.history.back();
  }
}
```

### 4. HTML Template

```html
<!-- payment.component.html -->
<div class="payment-container">
  <h1>VNPAY Payment</h1>
  
  <div *ngIf="error" class="alert alert-danger">
    {{ error }}
  </div>

  <div class="payment-form">
    <p>Order ID: {{ orderId }}</p>
    <button 
      (click)="proceedToVNPay()"
      [disabled]="isLoading"
      class="btn btn-primary">
      {{ isLoading ? 'Processing...' : 'Proceed to VNPAY' }}
    </button>
  </div>
</div>
```

```html
<!-- payment-success.component.html -->
<div class="payment-result-container">
  <div *ngIf="status === 'success'" class="success-section">
    <h1>✓ Payment Successful</h1>
    <div class="payment-info">
      <p><strong>Transaction Code:</strong> {{ transactionCode }}</p>
      <p><strong>Amount:</strong> {{ amount | currency:'VND' }}</p>
      <p><strong>Status:</strong> {{ paymentDetails?.status | uppercase }}</p>
      <p><strong>Date:</strong> {{ paymentDetails?.createdAt | date:'medium' }}</p>
    </div>
    <button class="btn btn-success" routerLink="/dashboard">
      Back to Dashboard
    </button>
  </div>

  <div *ngIf="status === 'failed'" class="failed-section">
    <h1>✗ Payment Failed</h1>
    <p>{{ message }}</p>
    <button class="btn btn-warning" (click)="retryPayment()">
      Retry Payment
    </button>
  </div>

  <div *ngIf="status === 'loading'" class="loading-section">
    <p>Processing payment...</p>
  </div>
</div>
```

## cURL Examples

### Create Payment
```bash
curl -X POST http://localhost:8000/payment/vnpay/create \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "6734567890abcdef12345678"
  }'
```

### Get Payment Details
```bash
curl -X GET http://localhost:8000/payment/vnpay/ORDER-123-ABCD123
```

### Cancel Payment
```bash
curl -X POST http://localhost:8000/payment/vnpay/ORDER-123-ABCD123/cancel \
  -H "Content-Type: application/json"
```

## Postman Collection

Import this into Postman:

```json
{
  "info": {
    "name": "VNPAY Payment API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Create Payment",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"orderId\": \"6734567890abcdef12345678\"\n}"
        },
        "url": {
          "raw": "http://localhost:8000/payment/vnpay/create",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8000",
          "path": ["payment", "vnpay", "create"]
        }
      }
    },
    {
      "name": "Get Payment Details",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:8000/payment/vnpay/ORDER-123-ABCD123",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8000",
          "path": ["payment", "vnpay", "ORDER-123-ABCD123"]
        }
      }
    },
    {
      "name": "Cancel Payment",
      "request": {
        "method": "POST",
        "url": {
          "raw": "http://localhost:8000/payment/vnpay/ORDER-123-ABCD123/cancel",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8000",
          "path": ["payment", "vnpay", "ORDER-123-ABCD123", "cancel"]
        }
      }
    }
  ]
}
```

## Database Schema

### Payment Document Structure

```json
{
  "_id": ObjectId,
  "orderId": ObjectId,
  "amount": 50000,
  "method": "VNPAY",
  "status": "paid",
  "transactionId": "ORDER-123-ABCD123",
  "vnpData": {
    "vnp_Amount": "5000000",
    "vnp_BankCode": "SACOMBANK",
    "vnp_ResponseCode": "00",
    "vnp_TransactionNo": "14356325"
  },
  "extraData": {},
  "createdBy": {
    "_id": ObjectId,
    "email": "user@example.com"
  },
  "isDeleted": false,
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

## Environment Variables Setup

Update your `.env` for different environments:

### Development (Sandbox)
```
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=GMDHGXBT
VNPAY_HASH_SECRET=3O4OWKHJH9Y1CE7TIVO9IHMQDK0RNCQR
FRONTEND_URL=http://localhost:4200
```

### Production
```
VNPAY_URL=https://pay.vnpay.vn/vpcpay.html
VNPAY_TMN_CODE=YOUR_PRODUCTION_TMN_CODE
VNPAY_HASH_SECRET=YOUR_PRODUCTION_HASH_SECRET
FRONTEND_URL=https://ap-post.vercel.app
```

## Common Issues and Solutions

### 1. "Order not found" error
**Solution:** 
- Verify order ID exists in database
- Check order is not deleted
- Use valid MongoDB ObjectId format

### 2. "No amount to pay online"
**Solution:**
- Ensure order has shipping fee or COD amount
- Check shipping fee payer configuration
- Verify order values are calculated correctly

### 3. Signature verification failed
**Solution:**
- Double-check VNPAY_HASH_SECRET in .env
- Ensure parameters are sorted correctly
- Verify no parameters are modified after payment creation

### 4. Payment status not updating
**Solution:**
- Check database connection
- Verify payment record exists
- Check IPN callback is configured
- Monitor server logs for errors

### 5. "Transaction already confirmed" error
**Solution:**
- This is expected - idempotent check
- Duplicate IPN is being handled correctly
- No action needed

## Next Steps

1. ✅ Setup completed
2. Test payment flow in sandbox environment
3. Configure webhook URL in VNPAY dashboard
4. Test IPN callback handling
5. Monitor transaction logs
6. Setup email notifications for successful payments
7. Deploy to production with production credentials
