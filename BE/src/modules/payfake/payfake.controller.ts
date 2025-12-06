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

    // FIX CHÍNH Ở ĐÂY
    const codValue = Number(order.codValue) || 0;
    const shippingFee = Number(order.shippingFee) || 0;
    const paymentMethod = order.paymentMethod || 'CASH';

    let amount = 0;
    if (['FAKE', 'MOMO', 'BANK_TRANSFER'].includes(paymentMethod)) {
      amount = codValue + shippingFee;
    } else if (paymentMethod === 'COD') {
      amount = 0;
    } else {
      amount = shippingFee;
    }

    if (amount <= 0) {
      throw new BadRequestException('Không có khoản nào cần thanh toán online');
    }
    // END FIX

    await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method: 'FAKE',
      amount,
      status: 'pending',
      transactionId: order.waybill || order._id.toString(),
    });

    const paymentUrl = this.fakePaymentService.buildPaymentUrl(
      order._id.toString(),
      amount,
      `Thanh toán đơn ${order.waybill || orderId} - APPost`,
      customerEmail,
    );

    return {
      success: true,
      message: 'Chuyển hướng đến cổng thanh toán giả lập...',
      paymentUrl,
    };
  }

  @Get('return') // Handle callback từ gateway (GET params)
  @Public()
  async handleReturn(@Query() query: Record<string, any>) {
    const {
      vnp_TxnRef: orderId,
      vnp_ResponseCode: responseCode,
      vnp_SecureHash: signature,
    } = query;
    if (!orderId) throw new BadRequestException('Missing orderId');

    const order = await this.orderModel.findById(orderId);
    if (!order) throw new BadRequestException('Order not found');

    const secret = 'FAKE_SECRET'; // Từ config
    const isValid = this.fakePaymentService.verifyReturnSignature(
      query,
      signature,
      secret,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid signature');
    }

    const status = responseCode === '00' ? 'paid' : 'failed';
    await this.paymentsService.updateStatus(orderId, status);

    if (status === 'paid') {
      await this.orderModel.updateOne(
        { _id: orderId },
        { status: 'CONFIRMED' },
      );
    }

    const returnPage = `${
      this.configService.get('FRONTEND_URL') || 'https://your-frontend.com'
    }/order-success?orderId=${orderId}&status=${status}`;
    return {
      success: status === 'paid',
      message: `Payment ${status}!`,
      redirect: returnPage,
    };
  }
}
