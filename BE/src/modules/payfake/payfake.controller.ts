import {
  Controller,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Order } from '../orders/schemas/order.schemas';
import { Model } from 'mongoose';
import { PaymentsService } from '../payments/payments.service';
import { Public } from 'src/health/decorator/customize';

@Controller('fake-payment')
export class FakePaymentController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private paymentsService: PaymentsService,
  ) {}

  @Post('')
  @Public()
  async create(@Body() body: { orderId: string }) {
    const { orderId } = body;
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

    // Simulate thanh toán (80% thành công)
    const isSuccess = Math.random() > 0.2;

    setTimeout(async () => {
      const status = isSuccess ? 'paid' : 'failed';
      await this.paymentsService.updateStatus(orderId, status);

      if (isSuccess) {
        await this.orderModel.updateOne({ _id: orderId }, { status: 'CONFIRMED' });
      }
    }, 2000); // Giả lập thời gian xử lý 2s

    return {
      success: true,
      message: isSuccess
        ? 'Thanh toán giả thành công! Đơn hàng đã được xác nhận.'
        : 'Thanh toán giả thất bại (test ngẫu nhiên)',
      redirect: false,
    };
  }
}