// payfake.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) { }

  private FAKE_BASE_URL = 'http://fake-payment-tkh.onrender.com/api/v1/payment/card';  // Thay bằng URL Render nếu deploy mới

  buildPaymentPayload(orderId: string, amount: number, orderInfo: string, order: any, cardData?: any, returnUrl?: string) {
    const cleanAmount = `${Math.round(amount)}.00`;  // String với .00 đúng
    const payload = {
      app_name: 'APPost',
      service: orderInfo || 'Shipping Service',
      customer_email: order.email || 'noemail@appost.com',
      card_type: 'VISA',
      card_holder_name: order.senderName || 'Test User',
      card_number: '4242424242424242',
      expiryMonth: '12',
      expiryYear: '2030',
      cvv: '123',
      amount: cleanAmount,
      currency: 'VND',
      order_id: orderId,
      order_info: orderInfo || `Thanh toán đơn ${order.waybill}`,
      return_url: returnUrl || 'https://ap-post.vercel.app/payment-success',  // Fields mới
    };

    // Merge cardData nếu từ form frontend (override dummy)
    if (cardData) {
      payload.card_number = cardData.card_number || payload.card_number;
      payload.card_holder_name = cardData.card_holder_name || payload.card_holder_name;
      payload.expiryMonth = cardData.expiryMonth || payload.expiryMonth;
      payload.expiryYear = cardData.expiryYear || payload.expiryYear;
      payload.cvv = cardData.cvv || payload.cvv;
      payload.card_type = cardData.card_type || payload.card_type;
    }

    return payload;
  }

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