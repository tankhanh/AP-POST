// src/modules/payments/fake-payment.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) {}

  // ĐÃ DEPLOY THÀNH CÔNG - DÙNG URL NÀY
  private FAKE_BASE_URL = 'https://fake-payment-gateway.vercel.app/api/v1/payment/card';

  // CHÍNH SỬA Ở ĐÂY: trả về URL để frontend POST trực tiếp
  buildPaymentUrl(orderId: string, amount: number, orderInfo: string, customerEmail: string) {
    // Không tạo URL GET có params nữa
    // Thay vào đó trả về URL của gateway + dữ liệu để frontend POST
    const returnUrl = this.configService.get<string>('FAKE_RETURN_URL') || 
      `https://your-frontend.com/order-success?orderId=${orderId}`;

    return {
      paymentUrl: this.FAKE_BASE_URL,
      method: 'POST',
      payload: {
        app_name: 'APPost',
        service: 'Shipping Service',
        customer_email: customerEmail || 'test@example.com',
        amount: amount.toFixed(2),
        currency: 'VND',
        // Các field này gateway sẽ tự redirect về sau khi thanh toán
        // Repo hỗ trợ thêm custom field để trả về trong callback
        order_id: orderId,
        order_info: orderInfo,
        return_url: returnUrl, // Gateway sẽ redirect về đây sau khi thanh toán
      },
    };
  }

  // Verify callback (gateway trả về GET, không có signature)
  verifyReturn(query: Record<string, any>): {
    success: boolean;
    orderId?: string;
    status?: 'success' | 'failed';
    message?: string;
  } {
    const { order_id, status, message } = query;

    if (!order_id) {
      return { success: false, message: 'Missing order_id' };
    }

    // Repo này không sign → chỉ cần kiểm tra có các field cơ bản là được
    if (status === 'success') {
      return { success: true, orderId: order_id as string, status: 'success' };
    } else {
      return { success: false, orderId: order_id as string, status: 'failed', message: message as string };
    }
  }
}