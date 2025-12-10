// payfake.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakePaymentService {
  constructor(private configService: ConfigService) { }

  private FAKE_BASE_URL = 'https://fake-payment-gateway.vercel.app/api/v1/payment/card';

  buildPaymentPayload(orderId: string, amount: number, orderInfo: string, order: any) {
    const cleanAmount = Math.round(amount).toFixed(2);
    return {
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
      order_info: orderInfo || `Thanh toán đơn ${orderId}`,
    };
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