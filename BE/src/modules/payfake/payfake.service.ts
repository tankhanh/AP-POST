// src/modules/payments/fake-payment.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) {}

  private FAKE_BASE_URL = 'https://payfake-appost.onrender.com/api/v1/payment/card'; // Hoặc /phone nếu cần

  buildPaymentUrl(orderId: string, amount: number, orderInfo: string, customerEmail: string): string {
    const createDate = new Date();
    const inputData: Record<string, string> = {
      app_name: 'APPost', // Theo repo sample
      service: 'Shipping Service',
      customer_email: customerEmail || 'test@example.com',
      amount: amount.toFixed(2), // USD hoặc VND, theo repo dùng string
      currency: 'VND',
      order_id: orderId.substring(0, 30), // TxnRef
      order_info: orderInfo,
      return_url: this.configService.get<string>('FAKE_RETURN_URL') || 'https://your-backend-domain.com/api/v1/fake-payment/return',
      // Không cần card details ở đây (sẽ nhập trên gateway form)
      // Nếu muốn prefill, thêm nhưng repo expect POST body sau redirect (giả sử query cho đơn giản)
    };

    // Fake hash đơn giản (dùng secret từ .env nếu cần verify)
    const secret = this.configService.get<string>('FAKE_SECRET') || 'FAKE_SECRET';
    const hashData = Object.entries(inputData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    const secureHash = crypto.createHmac('sha256', secret).update(hashData).digest('hex'); // Đổi sha512 → sha256 cho đơn giản

    const params = new URLSearchParams(inputData);
    params.append('vnp_SecureHash', secureHash); // Giữ tên cho tương thích, hoặc đổi thành 'signature'

    return `${this.FAKE_BASE_URL}?${params.toString()}`;
  }

  // Method để verify return từ gateway (gọi từ return controller)
  verifyReturnSignature(data: Record<string, any>, receivedSignature: string, secret: string): boolean {
    const inputData = { ...data };
    delete inputData.vnp_SecureHash; // Bỏ signature khi hash lại
    const sortedData = Object.entries(inputData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${encodeURIComponent(value.toString())}`)
      .join('&');
    const computedHash = crypto.createHmac('sha256', secret).update(sortedData).digest('hex');
    return computedHash === receivedSignature;
  }

  private formatDate(date: Date): string {
    // Giữ nếu cần, nhưng repo không dùng
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }
}