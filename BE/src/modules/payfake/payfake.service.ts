// src/modules/payments/payfake.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Trả về object:
 * { paymentUrl: string, method: 'POST', payload: Record<string,string|number> }
 */
@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) {}

  // URL của Fake Gateway (dùng production domain của bạn)
  private FAKE_BASE_URL = 'https://fake-payment-gateway.vercel.app/api/v1/payment/card';

  /**
   * Build payload đầy đủ mà Koa fake gateway mong muốn.
   * Sử dụng thẻ test (4242...) để tiện test.
   */
  buildPaymentUrl(orderId: string, amount: number, orderInfo: string, customerEmail?: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://ap-post.vercel.app';
    const returnUrl = `${frontendUrl}/order-success`;

    const cleanAmount = Math.round(Number(amount)); // làm tròn số (fake gateway chấp nhận string/number)

    // Build payload EXACT theo mẫu Koa (thêm order_id, order_info, return_url như extra fields)
    const payload: Record<string, string | number> = {
      app_name: 'APPost',
      service: 'Shipping Service',
      customer_email: customerEmail || 'customer@example.com',
      card_type: 'VISA',
      card_holder_name: 'Khách hàng test',
      card_number: '4242424242424242',
      expiryMonth: '12',
      expiryYear: '2030',
      cvv: '123',
      amount: cleanAmount, // hoặc `${cleanAmount}.00`
      currency: 'VND',

      // Extra fields để fake gateway / FE có thể dùng lại
      order_id: orderId,
      order_info: orderInfo || `Thanh toán đơn ${orderId}`,
      return_url: `${returnUrl}?orderId=${orderId}`,
    };

    return {
      paymentUrl: this.FAKE_BASE_URL,
      method: 'POST',
      payload,
    };
  }

  /**
   * Verify callback từ gateway (nếu cần).
   * Giữ nguyên logic cũ hoặc điều chỉnh nếu muốn.
   */
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
      return { success: false, orderId: order_id as string, status: 'failed', message: (message as string) || 'Thanh toán thất bại' };
    }
  }
}
