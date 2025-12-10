// src/modules/payments/fake-payment.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) {}

  // URL gateway của bạn (đã sửa xong)
  private FAKE_BASE_URL = 'https://fake-payment-gateway.vercel.app/api/v1/payment/card';

  buildPaymentUrl(orderId: string, amount: number, orderInfo: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://ap-post.vercel.app';
    const returnUrl = `${frontendUrl}/order-success`;

    return {
      paymentUrl: this.FAKE_BASE_URL,
      method: 'POST',
      payload: {
        // CHỈ CẦN 3 FIELD NÀY LÀ GATEWAY CHẤP NHẬN LUÔN
        amount: amount.toFixed(2),                                    // BẮT BUỘC
        order_id: orderId,                                            // Để callback về đúng đơn
        return_url: `${returnUrl}?orderId=${orderId}`,                // Gateway sẽ trả redirect_to về đây

        // Các field dưới đây chỉ để đẹp, không bắt buộc
        order_info: orderInfo || `Thanh toán đơn ${orderId}`,
        app_name: 'APPost',
        currency: 'VND',
      },
    };
  }

  // Verify callback từ gateway (dùng chung được)
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

    if (status === 'success') {
      return { success: true, orderId: order_id as string, status: 'success' };
    } else {
      return { success: false, orderId: order_id as string, status: 'failed', message: message as string || 'Thanh toán thất bại' };
    }
  }
}