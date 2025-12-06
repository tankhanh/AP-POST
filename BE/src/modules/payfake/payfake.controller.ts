// src/modules/payments/fake-payment.controller.ts
import {
  Controller,
  Post,
  Body,
  Query,
  Res,
  Get,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Order } from '../orders/schemas/order.schemas';
import { Model } from 'mongoose';
import { Public } from 'src/health/decorator/customize';
import type { Response } from 'express';
import { FakePaymentService } from './payfake.service';
import { PaymentsService } from '../payments/payments.service';

@Controller('fake-payment') // Thay 'vnpay' bằng 'fake-payment'
export class FakePaymentController {
  constructor(
    private fakePaymentService: FakePaymentService,
    private paymentsService: PaymentsService,
    @InjectModel(Order.name) private orderModel: Model<Order>,
  ) {}

  @Post('')
  @Public()
  async create(@Body() body: { orderId: string }) {
    if (!body.orderId) throw new BadRequestException('orderId is required');

    const order = await this.orderModel.findById(body.orderId).lean();
    if (!order) throw new BadRequestException('Đơn hàng không tồn tại');

    const amount = order.senderPayAmount || order.totalOrderValue || 0;
    if (amount <= 0) throw new BadRequestException('Số tiền không hợp lệ');

    const payUrl = this.fakePaymentService.buildPaymentUrl(
      order.waybill || order._id.toString(),
      amount,
      `Thanh toan don hang ${order.waybill || order._id}`,
    );

    await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method: 'FAKE',
      amount,
      status: 'pending',
      transactionId: order.waybill || order._id.toString(),
    });

    return { success: true, payUrl };
  }

  // IPN và Return: Giữ tương tự, nhưng dùng verifySignature của fake
  @Get('ipn')
  @Public()
  async ipn(@Query() query: any, @Res() res: Response) {
    const result = await this.handleCallback(query);
    return res.status(200).json(result);
  }

  @Get('return')
  @Public()
  async return(@Query() query: any, @Res() res: Response) {
    const result = await this.handleCallback(query);

    if (query.vnp_ResponseCode === '00') {
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/success?orderId=${query.vnp_TxnRef}`,
      );
    } else {
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/fail?code=${query.vnp_ResponseCode}`,
      );
    }
  }

  private async handleCallback(params: any) {
    const secureHash = params.vnp_SecureHash;
    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;

    if (!secureHash) {
      return { RspCode: '99', Message: 'Missing signature' };
    }

    const isValid = this.fakePaymentService.verifySignature(params, secureHash);
    if (!isValid) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const orderId = params.vnp_TxnRef;
    const amount = parseInt(params.vnp_Amount) / 100;
    const responseCode = params.vnp_ResponseCode;

    const order = await this.orderModel.findOne({
      $or: [{ waybill: orderId }, { _id: orderId }],
    });

    if (!order) return { RspCode: '01', Message: 'Order not found' };
    if (amount !== (order.senderPayAmount || order.totalOrderValue || 0))
      return { RspCode: '04', Message: 'Invalid amount' };

    const status = responseCode === '00' ? 'paid' : 'failed';
    await this.paymentsService.updateStatus(orderId, status); // Sử dụng updateStatus hiện có

    if (responseCode === '00') {
      await this.orderModel.updateOne(
        { _id: order._id },
        { status: 'CONFIRMED' },
      );
      return { RspCode: '00', Message: 'Confirm Success' };
    } else {
      return { RspCode: '02', Message: 'Payment failed' };
    }
  }
}
