// src/modules/payments/fake-payment.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto'; // Nếu fake cần hash, giữ nguyên; nếu không cần, xóa

@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) {}

  private FAKE_BASE_URL = 'https://payfake-appost.onrender.com'; // URL deploy của bạn

  private sortObject(obj: Record<string, any>): Record<string, string> {
    // Giữ nguyên từ VnpayService nếu cần sort params
    const sorted: Record<string, string> = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        const value = obj[key];
        if (value !== undefined && value !== null) {
          sorted[key] = value.toString();
        }
      });
    return sorted;
  }

  buildPaymentUrl(
    orderId: string,
    amount: number,
    orderInfo: string,
    // Các params khác nếu cần, giữ tương tự VNPAY
  ): string {
    const createDate = new Date();
    const inputData: Record<string, string> = {
      vnp_Version: '2.1.0', // Giữ tương tự để fake giống VNPAY
      vnp_Command: 'pay',
      vnp_TmnCode: 'FAKE_TMNCODE', // Fake value
      vnp_Amount: (amount * 100).toString(),
      vnp_CreateDate: this.formatDate(createDate),
      vnp_CurrCode: 'VND',
      vnp_IpAddr: '127.0.0.1',
      vnp_Locale: 'vn',
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: '250000',
      vnp_ReturnUrl: this.configService.get<string>('FAKE_RETURN_URL') || 'http://your-backend/return', // Config env: FAKE_RETURN_URL
      vnp_TxnRef: orderId.substring(0, 30),
    };

    // Nếu fake cần hash, tính hash (giả sử cần)
    const hashData = Object.keys(inputData).map(key => `${key}=${encodeURIComponent(inputData[key])}`).join('&');
    const secureHash = crypto.createHmac('sha512', 'FAKE_SECRET') // Fake secret
      .update(hashData)
      .digest('hex');

    const params = new URLSearchParams(inputData);
    params.append('vnp_SecureHash', secureHash);

    return `${this.FAKE_BASE_URL}/payment?${params.toString()}`; // Giả sử endpoint là /payment
  }

  private formatDate(date: Date): string {
    return date.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  }

  verifySignature(data: Record<string, any>, signature: string): boolean {
    // Giả sử luôn true cho fake, hoặc implement nếu repo yêu cầu
    return true;
  }
}