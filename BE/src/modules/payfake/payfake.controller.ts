// payfake.controller.ts
import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Get,
  Query,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Order } from '../orders/schemas/order.schemas';
import { Model } from 'mongoose';
import { PaymentsService } from '../payments/payments.service';
import { Public } from 'src/health/decorator/customize';
import { FakePaymentService } from './payfake.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, map } from 'rxjs';

@Controller('payment')
export class FakePaymentController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private paymentsService: PaymentsService,
    private fakePaymentService: FakePaymentService,
    private configService: ConfigService,
    private httpService: HttpService,
  ) { }

  @Post('card')
  @Public()
  async create(@Body() body: { orderId: string }) {
    const { orderId } = body;
    if (!orderId) throw new BadRequestException('orderId required');
    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new BadRequestException('Order not found');
    if (order.isDeleted) throw new BadRequestException('Đơn hàng đã bị xóa');

    let amountToPay = 0;
    if (order.shippingFeePayer === 'SENDER') {
      // Người gửi trả hết: phí ship + COD
      amountToPay = (order.shippingFee || 0) + (order.codValue || 0);
    } else {
      // Người nhận trả COD → người gửi chỉ trả ship online
      amountToPay = order.shippingFee || 0;
    }
    if (amountToPay <= 0) {
      throw new BadRequestException('Không có tiền cần thanh toán online');
    }

    // Tạo payment pending
    await this.paymentsService.createPaymentForOrder(orderId, {
      method: 'FAKE',
      amount: amountToPay,
      status: 'pending',
      transactionId: order.waybill,
    });

    const amountStr = Number(amountToPay).toFixed(2);
    // Build full payload đồng bộ với gateway's Card model (hardcode defaults)
    
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://ap-post.vercel.app';
    const returnUrl = `${frontendUrl}/order-success?orderId=${orderId}`;
    
    const payload = {
      app_name: 'APPost',
      service: order.details || 'Shipping Service',
      customer_email: order.email || 'noemail@appost.com',
      card_type: 'VISA',
      card_holder_name: order.senderName || 'Test User',
      card_number: '4242424242424242',
      expiryMonth: '12',
      expiryYear: '2030',
      cvv: '123',
      amount: amountStr,   // phải là chuỗi
      currency: 'VND',
      order_id: orderId,
      order_info: `Thanh toán đơn ${order.waybill} - APPost`,
      return_url: returnUrl,
    };


    // Gọi POST đến gateway từ server
    try {
      const gatewayResponse = await lastValueFrom(
        this.httpService.post('https://fake-payment-gateway.vercel.app/api/v1/payment/card', payload)
          .pipe(map((res: any) => res.data))
      ) as { success: boolean; message?: string };

      if (gatewayResponse.success) {
        // Update status
        await this.paymentsService.updateStatus(orderId, 'paid');
        await this.orderModel.updateOne({ _id: orderId }, { status: 'CONFIRMED' });

        // Return redirect cho frontend
        return {
          success: true,
          message: 'Thanh toán thành công (fake)',
          redirectUrl: `${returnUrl}&status=paid&msg=${encodeURIComponent('Thanh toán thành công')}`,
        };
      } else {
        await this.paymentsService.updateStatus(orderId, 'failed');
        return {
          success: false,
          message: gatewayResponse.message || 'Thanh toán thất bại',
          redirectUrl: `${returnUrl}&status=failed&msg=${encodeURIComponent(gatewayResponse.message || 'Thanh toán thất bại')}`,
        };
      }
    } catch (err) {
      await this.paymentsService.updateStatus(orderId, 'failed');
      throw new BadRequestException('Lỗi kết nối gateway: ' + (err.message || 'Unknown'));
    }
  }

  @Get('return')
  @Public()
  async handleReturn(@Query() query: Record<string, any>) {
    const verifyResult = this.fakePaymentService.verifyReturn(query);
    if (!verifyResult.orderId) {
      throw new BadRequestException('Invalid callback');
    }
    const orderId = verifyResult.orderId;
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new BadRequestException('Order not found');
    const status = verifyResult.success ? 'paid' : 'failed';
    await this.paymentsService.updateStatus(orderId, status);
    if (verifyResult.success) {
      await this.orderModel.updateOne(
        { _id: orderId },
        { status: 'CONFIRMED' },
      );
    }
    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'https://ap-post.vercel.app';
    const redirectUrl = `${frontendUrl}/order-success?orderId=${orderId}&status=${status}&msg=${encodeURIComponent(
      verifyResult.message || '',
    )}`;
    return `
    <script>
      window.location.href = "${redirectUrl}";
    </script>
    <p>Đang chuyển hướng... <a href="${redirectUrl}">Click here if not redirected</a></p>
  `;
  }
}