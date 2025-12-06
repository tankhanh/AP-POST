// src/modules/payfake/payfake.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Res,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { PayfakeService } from './payfake.service';
import { PaymentsService } from '../payments/payments.service';
import { Order } from '../orders/schemas/order.schemas';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Response } from 'express';
import { Public } from 'src/health/decorator/customize';

@Controller('payfake')
export class PayfakeController {
  constructor(
    private payfakeService: PayfakeService,
    private paymentsService: PaymentsService,
    @InjectModel(Order.name) private orderModel: Model<Order>,
  ) {}

  @Post()
  @Public()
  async create(@Body() body: { orderId: string }) {
    if (!body.orderId) throw new BadRequestException('orderId is required');

    const order = await this.orderModel.findById(body.orderId).lean();
    if (!order) throw new BadRequestException('Đơn hàng không tồn tại');

    const amount = order.senderPayAmount || order.totalOrderValue || 0;
    if (amount <= 0) throw new BadRequestException('Số tiền không hợp lệ');

    const returnUrl = `${process.env.FRONTEND_URL}/payment/result`;

    const payUrl = this.payfakeService.buildPaymentUrl(
      order._id.toString(),
      order.waybill,
      amount,
      returnUrl,
    );

    // Tạo payment record
    await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method: 'PAYFAKE',
      amount,
      status: 'pending',
      transactionId: order.waybill,
    });

    return { success: true, payUrl };
  }

  @Get('callback')
  @Public()
  async callback(
    @Query('orderId') orderId: string,
    @Query('status') status: string,
    @Res() res: Response,
  ) {
    if (!orderId || !status) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment/fail`);
    }

    const order = await this.orderModel.findOne({ waybill: orderId }).lean();
    if (!order) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment/fail`);
    }

    if (status === 'success') {
      await this.paymentsService.updatePaymentStatus(orderId, 'success');
      return res.redirect(`${process.env.FRONTEND_URL}/payment/success?orderId=${orderId}`);
    } else {
      await this.paymentsService.updatePaymentStatus(orderId, 'failed');
      return res.redirect(`${process.env.FRONTEND_URL}/payment/fail`);
    }
  }
}