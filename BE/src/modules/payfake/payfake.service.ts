// src/modules/payments/fake-payment.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto'; // Nếu fake cần hash, giữ nguyên; nếu không cần, xóa

@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) {}

  private FAKE_BASE_URL =
    'https://payfake-appost.onrender.com/api/v1/payment/card';

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

  buildPaymentUrl(orderId: string, amount: number, orderInfo: string): string {
    const createDate = new Date();
    const inputData: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: 'FAKE_TMNCODE',
      vnp_Amount: (amount * 100).toString(), // Đúng
      vnp_CreateDate: this.formatDate(createDate), // Fix format nếu cần
      vnp_CurrCode: 'VND',
      vnp_IpAddr: '127.0.0.1', // Thay bằng req.ip nếu có trong controller
      vnp_Locale: 'vn',
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: '250000',
      vnp_ReturnUrl:
        this.configService.get<string>('FAKE_RETURN_URL') ||
        'https://your-backend-domain/fake-payment/return', // Thay bằng URL thực (thêm vào .env: FAKE_RETURN_URL=https://ap-post-api.onrender.com/api/v1/fake-payment/return)
      vnp_TxnRef: orderId.substring(0, 30),
    };

    // Hash: Nếu repo không yêu cầu, bỏ phần này hoặc dùng fake hash
    const hashData = Object.keys(inputData)
      .sort()
      .map((key) => `${key}=${encodeURIComponent(inputData[key])}`)
      .join('&');
    const secureHash = crypto
      .createHmac('sha512', 'FAKE_SECRET')
      .update(hashData)
      .digest('hex'); // Nếu cần, thay 'FAKE_SECRET' bằng giá trị từ .env

    const params = new URLSearchParams(inputData);
    params.append('vnp_SecureHash', secureHash);

    return `${this.FAKE_BASE_URL}/payment?${params.toString()}`;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  verifySignature(data: Record<string, any>, signature: string): boolean {
    return true; // Luôn true cho test, sau này implement nếu cần
  }
}
