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

  @Post() // Đổi tên endpoint để rõ (hoặc giữ '', nhưng thêm /create cho phân biệt)
  @Public()
  async create(@Body() body: { orderId: string; customerEmail?: string }) { // Thêm email nếu cần
    const { orderId, customerEmail = 'test@example.com' } = body;
    if (!orderId) throw new BadRequestException('orderId required');

    const order = await this.orderModel.findById(orderId);
    if (!order) throw new BadRequestException('Order not found');

    const amount = order.senderPayAmount || order.totalOrderValue || 0;
    if (amount <= 0) throw new BadRequestException('Invalid amount');

    // Tạo payment pending
    await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method: 'FAKE',
      amount,
      status: 'pending',
      transactionId: order.waybill || order._id.toString(),
    });

    // Build URL redirect đến fake gateway
    const orderInfo = `Order ${order.waybill || orderId}`;
    const paymentUrl = this.fakePaymentService.buildPaymentUrl(
      orderId,
      amount,
      orderInfo,
      customerEmail, // Từ body hoặc order.email
    );

    // Redirect ngay (hoặc return URL cho frontend handle)
    return {
      success: true,
      message: 'Redirecting to fake payment gateway...',
      paymentUrl, // Frontend sẽ window.location.href = paymentUrl
      redirect: true, // Flag để frontend biết redirect
    };
  }

  @Get('return') // Handle callback từ gateway (GET params)
  @Public()
  async handleReturn(@Query() query: Record<string, any>) {
    const { vnp_TxnRef: orderId, vnp_ResponseCode: responseCode, vnp_SecureHash: signature } = query;
    if (!orderId) throw new BadRequestException('Missing orderId');

    const order = await this.orderModel.findById(orderId);
    if (!order) throw new BadRequestException('Order not found');

    const secret = 'FAKE_SECRET'; // Từ config
    const isValid = this.fakePaymentService.verifyReturnSignature(query, signature, secret);

    if (!isValid) {
      throw new BadRequestException('Invalid signature');
    }

    const status = responseCode === '00' ? 'paid' : 'failed';
    await this.paymentsService.updateStatus(orderId, status);

    if (status === 'paid') {
      await this.orderModel.updateOne({ _id: orderId }, { status: 'CONFIRMED' });
    }

    const returnPage = `${this.configService.get('FRONTEND_URL') || 'https://your-frontend.com'}/order-success?orderId=${orderId}&status=${status}`;
    return { success: status === 'paid', message: `Payment ${status}!`, redirect: returnPage };
  }
}