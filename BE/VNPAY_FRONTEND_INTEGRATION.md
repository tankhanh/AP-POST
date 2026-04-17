# Frontend Integration Example - VNPAY Payment

This file provides ready-to-use Angular components and services for integrating VNPAY into your frontend.

## Frontend Setup

### 1. Payment Service (Angular)

Create `src/app/services/payment.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = `${environment.apiUrl}/payment/vnpay`;

  constructor(private http: HttpClient) {}

  /**
   * Create VNPAY payment URL
   */
  createVNPayPayment(orderId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, { orderId })
      .pipe(
        catchError((error) => {
          console.error('Payment creation error:', error);
          return throwError(() => new Error(error.error?.message || 'Payment creation failed'));
        })
      );
  }

  /**
   * Get payment details
   */
  getPaymentDetails(transactionCode: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${transactionCode}`)
      .pipe(
        catchError((error) => {
          console.error('Get payment details error:', error);
          return throwError(() => new Error(error.error?.message || 'Failed to get payment details'));
        })
      );
  }

  /**
   * Cancel payment
   */
  cancelPayment(transactionCode: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${transactionCode}/cancel`, {})
      .pipe(
        catchError((error) => {
          console.error('Cancel payment error:', error);
          return throwError(() => new Error(error.error?.message || 'Failed to cancel payment'));
        })
      );
  }

  /**
   * Verify payment return from VNPAY
   */
  verifyPaymentReturn(queryParams: any): Observable<any> {
    return new Observable(observer => {
      try {
        const { status, transactionCode, amount, message } = queryParams;
        
        if (status === 'success') {
          observer.next({
            success: true,
            transactionCode,
            amount: parseInt(amount || 0),
            message: 'Payment completed successfully'
          });
        } else {
          observer.next({
            success: false,
            message: message || 'Payment failed'
          });
        }
        observer.complete();
      } catch (error) {
        observer.error(error);
      }
    });
  }
}
```

### 2. Payment Component

Create `src/app/components/payment/vnpay-payment.component.ts`:

```typescript
import { Component, OnInit, Input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PaymentService } from '../../services/payment.service';
import { ToastrService } from 'ngx-toastr'; // Use your notification service

@Component({
  selector: 'app-vnpay-payment',
  templateUrl: './vnpay-payment.component.html',
  styleUrls: ['./vnpay-payment.component.css']
})
export class VnpayPaymentComponent implements OnInit {
  @Input() orderId: string;

  isLoading = false;
  error: string | null = null;
  paymentUrl: string | null = null;
  showPaymentModal = false;

  constructor(
    private paymentService: PaymentService,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService
  ) {
    this.orderId = this.route.snapshot.queryParams['orderId'] || '';
  }

  ngOnInit() {
    if (!this.orderId) {
      this.error = 'Order ID is required';
    }
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

    this.paymentService.createVNPayPayment(this.orderId).subscribe({
      next: (response) => {
        if (response.success) {
          this.paymentUrl = response.data.paymentUrl;
          this.toastr.info('Redirecting to VNPAY...');
          
          // Redirect to VNPAY payment page
          setTimeout(() => {
            window.location.href = response.data.paymentUrl;
          }, 1000);
        } else {
          this.error = response.message || 'Failed to create payment';
          this.toastr.error(this.error);
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.error = err.message || 'An error occurred';
        this.toastr.error(this.error);
        this.isLoading = false;
      }
    });
  }

  /**
   * Cancel and close payment modal
   */
  closePaymentModal() {
    this.showPaymentModal = false;
    this.paymentUrl = null;
  }
}
```

### 3. Payment Template

Create `src/app/components/payment/vnpay-payment.component.html`:

```html
<div class="vnpay-payment-container">
  <!-- Error Message -->
  <div *ngIf="error" class="alert alert-danger alert-dismissible fade show" role="alert">
    <strong>Error!</strong> {{ error }}
    <button type="button" class="btn-close" (click)="error = null"></button>
  </div>

  <!-- Payment Button -->
  <div class="payment-section">
    <h3>VNPAY Payment</h3>
    <p>Order ID: <strong>{{ orderId }}</strong></p>
    
    <button 
      class="btn btn-primary btn-lg"
      (click)="proceedToVNPay()"
      [disabled]="isLoading || !orderId">
      <span *ngIf="!isLoading">
        <i class="bi bi-credit-card"></i> Pay with VNPAY
      </span>
      <span *ngIf="isLoading">
        <i class="spinner-border spinner-border-sm me-2"></i>
        Processing...
      </span>
    </button>

    <p class="mt-3 text-muted small">
      You will be redirected to VNPAY secure payment gateway
    </p>
  </div>
</div>
```

### 4. Payment Success Component

Create `src/app/components/payment/payment-success.component.ts`:

```typescript
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PaymentService } from '../../services/payment.service';

@Component({
  selector: 'app-payment-success',
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.css']
})
export class PaymentSuccessComponent implements OnInit {
  status: 'success' | 'failed' | 'error' | 'loading' = 'loading';
  message: string = '';
  transactionCode: string = '';
  amount: number = 0;
  responseCode: string = '';
  paymentDetails: any = null;
  isLoadingDetails = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private paymentService: PaymentService
  ) {}

  ngOnInit() {
    // Get query parameters from return URL
    this.route.queryParams.subscribe((params) => {
      this.status = (params['status'] || 'error') as any;
      this.message = params['message'] || '';
      this.transactionCode = params['transactionCode'] || '';
      this.amount = parseInt(params['amount']) || 0;
      this.responseCode = params['responseCode'] || '';

      // Fetch payment details if transaction code available
      if (this.transactionCode) {
        this.fetchPaymentDetails();
      }
    });
  }

  /**
   * Fetch payment details from backend
   */
  fetchPaymentDetails() {
    if (!this.transactionCode) return;

    this.isLoadingDetails = true;

    this.paymentService.getPaymentDetails(this.transactionCode).subscribe({
      next: (response) => {
        if (response.success) {
          this.paymentDetails = response.data;
        }
        this.isLoadingDetails = false;
      },
      error: (err) => {
        console.error('Failed to fetch payment details:', err);
        this.isLoadingDetails = false;
      }
    });
  }

  /**
   * Return to dashboard
   */
  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  /**
   * Retry payment
   */
  retryPayment() {
    this.router.navigate(['/payment/vnpay'], {
      queryParams: { orderId: this.paymentDetails?.orderId }
    });
  }

  /**
   * Get status badge class
   */
  getStatusClass(): string {
    switch (this.status) {
      case 'success':
        return 'badge bg-success';
      case 'failed':
        return 'badge bg-danger';
      case 'error':
        return 'badge bg-warning';
      default:
        return 'badge bg-secondary';
    }
  }

  /**
   * Get status icon
   */
  getStatusIcon(): string {
    switch (this.status) {
      case 'success':
        return '✓';
      case 'failed':
        return '✕';
      case 'error':
        return '!';
      default:
        return '...';
    }
  }
}
```

### 5. Payment Success Template

Create `src/app/components/payment/payment-success.component.html`:

```html
<div class="payment-result-container">
  <!-- Loading State -->
  <div *ngIf="status === 'loading'" class="result-section loading">
    <div class="spinner-border" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
    <p class="mt-3">Processing your payment...</p>
  </div>

  <!-- Success State -->
  <div *ngIf="status === 'success'" class="result-section success">
    <div class="status-icon success-icon">
      <i class="bi bi-check-circle"></i>
    </div>
    <h1>Payment Successful</h1>
    <p class="subtitle">Your payment has been processed successfully</p>

    <div class="payment-details card mt-4" *ngIf="paymentDetails">
      <div class="card-body">
        <div class="detail-row">
          <span class="label">Transaction Code:</span>
          <span class="value">{{ transactionCode }}</span>
        </div>
        <div class="detail-row">
          <span class="label">Amount:</span>
          <span class="value">{{ amount | currency:'VND':'symbol' }}</span>
        </div>
        <div class="detail-row">
          <span class="label">Status:</span>
          <span class="value">
            <span [ngClass]="getStatusClass()">
              {{ paymentDetails.status | uppercase }}
            </span>
          </span>
        </div>
        <div class="detail-row">
          <span class="label">Date:</span>
          <span class="value">{{ paymentDetails.createdAt | date:'medium' }}</span>
        </div>
      </div>
    </div>

    <div class="actions mt-5">
      <button class="btn btn-primary btn-lg" (click)="goToDashboard()">
        Back to Dashboard
      </button>
    </div>
  </div>

  <!-- Failed State -->
  <div *ngIf="status === 'failed'" class="result-section failed">
    <div class="status-icon failed-icon">
      <i class="bi bi-x-circle"></i>
    </div>
    <h1>Payment Failed</h1>
    <p class="subtitle">{{ message || 'Your payment could not be processed' }}</p>

    <div *ngIf="responseCode" class="alert alert-info mt-4">
      Error Code: {{ responseCode }}
    </div>

    <div class="actions mt-5">
      <button class="btn btn-warning btn-lg me-2" (click)="retryPayment()">
        <i class="bi bi-arrow-repeat"></i> Retry Payment
      </button>
      <button class="btn btn-secondary btn-lg" (click)="goToDashboard()">
        Back to Dashboard
      </button>
    </div>
  </div>

  <!-- Error State -->
  <div *ngIf="status === 'error'" class="result-section error">
    <div class="status-icon error-icon">
      <i class="bi bi-exclamation-circle"></i>
    </div>
    <h1>Payment Error</h1>
    <p class="subtitle">{{ message || 'An unexpected error occurred' }}</p>

    <div class="actions mt-5">
      <button class="btn btn-secondary btn-lg" (click)="goToDashboard()">
        Back to Dashboard
      </button>
    </div>
  </div>
</div>
```

### 6. Payment Success Styles

Create `src/app/components/payment/payment-success.component.css`:

```css
.payment-result-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 20px;
}

.result-section {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  padding: 40px;
  max-width: 500px;
  width: 100%;
  text-align: center;
}

.result-section.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.status-icon {
  font-size: 80px;
  margin-bottom: 20px;
}

.status-icon.success-icon {
  color: #28a745;
  animation: slideDown 0.5s ease-out;
}

.status-icon.failed-icon {
  color: #dc3545;
  animation: shake 0.5s ease-out;
}

.status-icon.error-icon {
  color: #ffc107;
}

@keyframes slideDown {
  from {
    transform: translateY(-50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}

.result-section h1 {
  font-weight: 600;
  margin-bottom: 10px;
  color: #333;
}

.subtitle {
  color: #666;
  font-size: 16px;
  margin-bottom: 20px;
}

.payment-details {
  background-color: #f8f9fa;
  border: none;
  margin-bottom: 30px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #e9ecef;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row .label {
  font-weight: 500;
  color: #666;
  text-align: left;
  flex: 1;
}

.detail-row .value {
  color: #333;
  font-weight: 600;
  text-align: right;
  flex: 1;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.actions button {
  padding: 12px 24px;
  font-size: 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
}

.actions button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.alert {
  margin-bottom: 20px;
  border-radius: 6px;
}

/* Responsive */
@media (max-width: 600px) {
  .result-section {
    padding: 30px 20px;
  }

  .status-icon {
    font-size: 60px;
  }

  .payment-details {
    font-size: 14px;
  }

  .actions {
    flex-direction: column;
  }

  .actions button {
    width: 100%;
  }
}
```

### 7. Module Configuration

Update `src/app/app.module.ts`:

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';

import { AppComponent } from './app.component';
import { VnpayPaymentComponent } from './components/payment/vnpay-payment.component';
import { PaymentSuccessComponent } from './components/payment/payment-success.component';
import { PaymentService } from './services/payment.service';

@NgModule({
  declarations: [
    AppComponent,
    VnpayPaymentComponent,
    PaymentSuccessComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    CommonModule
  ],
  providers: [PaymentService],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

### 8. Environment Configuration

Update `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000'
};
```

Update `src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://your-api-domain.com'
};
```

### 9. Routing Configuration

Update `src/app/app-routing.module.ts`:

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { VnpayPaymentComponent } from './components/payment/vnpay-payment.component';
import { PaymentSuccessComponent } from './components/payment/payment-success.component';

const routes: Routes = [
  {
    path: 'payment',
    children: [
      {
        path: 'vnpay',
        component: VnpayPaymentComponent
      },
      {
        path: 'success',
        component: PaymentSuccessComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
```

## Usage Example

### In Your Order Component:

```typescript
// In your order detail page, add payment button
<button 
  (click)="proceedToVNPayPayment()"
  class="btn btn-success">
  Pay with VNPAY
</button>

// In component
proceedToVNPayPayment() {
  this.router.navigate(['/payment/vnpay'], {
    queryParams: { orderId: this.orderId }
  });
}
```

## Features Included

✅ Payment URL generation
✅ Secure redirect to VNPAY
✅ Payment success/failure handling
✅ Payment details display
✅ Retry payment capability
✅ Error handling and display
✅ Loading states
✅ Toast notifications
✅ Responsive design
✅ TypeScript type safety

---

Ready to integrate! Copy these files into your Angular project and customize as needed.
