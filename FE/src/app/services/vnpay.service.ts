import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { env } from '../environments/environment';
import { VNPayCreatePaymentResponse, PaymentDetailsResponse, ApiResponse } from '../types/payment.types';

@Injectable({
  providedIn: 'root'
})
export class VnpayService {
  private apiUrl = `${env.apiUrl}/payment/vnpay`;

  constructor(private http: HttpClient) {}

  /**
   * Create VNPAY payment URL
   */
  createPayment(orderId: string, amount?: number): Observable<VNPayCreatePaymentResponse> {
    const body: any = { orderId };
    if (typeof amount === 'number') body.amount = amount;
    return this.http.post<VNPayCreatePaymentResponse>(`${this.apiUrl}/create`, body).pipe(
      catchError((error) => {
        console.error('Payment creation error:', error);
        return throwError(
          () => new Error(error.error?.message || 'Failed to create payment')
        );
      })
    );
  }

  /**
   * Get payment details
   */
  getPaymentDetails(transactionCode: string): Observable<PaymentDetailsResponse> {
    return this.http.get<PaymentDetailsResponse>(`${this.apiUrl}/${transactionCode}`).pipe(
      catchError((error) => {
        console.error('Get payment details error:', error);
        return throwError(
          () => new Error(error.error?.message || 'Failed to get payment details')
        );
      })
    );
  }

  /**
   * Cancel payment
   */
  cancelPayment(transactionCode: string): Observable<ApiResponse<any>> {
    return this.http
      .post<ApiResponse<any>>(`${this.apiUrl}/${transactionCode}/cancel`, {})
      .pipe(
        catchError((error) => {
          console.error('Cancel payment error:', error);
          return throwError(
            () => new Error(error.error?.message || 'Failed to cancel payment')
          );
        })
      );
  }
}
