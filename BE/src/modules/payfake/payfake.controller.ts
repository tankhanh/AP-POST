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

@Controller('fake-payment')
export class FakePaymentController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private paymentsService: PaymentsService,
    private fakePaymentService: FakePaymentService,
    private configService: ConfigService,
  ) {}

  @Post()
  @Public()
  async create(@Body() body: { orderId: string; customerEmail?: string }) {
    const { orderId, customerEmail = 'test@example.com' } = body;
    if (!orderId) throw new BadRequestException('orderId required');

    const order = await this.orderModel.findById(orderId);
    if (!order) throw new BadRequestException('Order not found');

    const codValue = Number(order.codValue) || 0;
    const shippingFee = Number(order.shippingFee) || 0;
    const paymentMethod = order.paymentMethod || 'CASH';

    let amount = 0;
    if (['FAKE', 'MOMO', 'BANK_TRANSFER'].includes(paymentMethod)) {
      amount = codValue + shippingFee;
    } else if (paymentMethod === 'COD') {
      amount = shippingFee; // chỉ thu hộ phí ship
    } else if (paymentMethod === 'CASH') {
      amount = shippingFee;
    }

    if (amount <= 0) {
      throw new BadRequestException('Không có khoản nào cần thanh toán online');
    }

    await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method: 'FAKE',
      amount,
      status: 'pending',
      transactionId: order.waybill || order._id.toString(),
    });

    const result = this.fakePaymentService.buildPaymentUrl(
      order._id.toString(),
      amount,
      `Thanh toán đơn ${order.waybill || orderId} - APPost`,
      customerEmail,
    );

    return {
      success: true,
      message: 'Chuẩn bị chuyển hướng đến cổng thanh toán giả lập...',
      paymentUrl: result.paymentUrl,
      method: 'POST',
      payload: result.payload,
    };
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
