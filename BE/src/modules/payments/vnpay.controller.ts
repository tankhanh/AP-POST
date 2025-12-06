// src/modules/payments/vnpay.controller.ts
import {
  Controller,
  Post,
  Body,
  Query,
  Req,
  BadRequestException,
  Get,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { VnpayService } from './vnpay.service';
import { PaymentsService } from './payments.service';
import { InjectModel } from '@nestjs/mongoose';
import { Order } from '../orders/schemas/order.schemas';
import { Model } from 'mongoose';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from 'src/health/decorator/customize';

@ApiTags('payments')
@Controller('vnpay')
export class VnpayController {
  constructor(
    private vnpayService: VnpayService,
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

    const payUrl = this.vnpayService.buildPaymentUrl(
      order.waybill || order._id.toString(),
      amount,
      `Thanh toan don hang ${order.waybill || order._id}`,
      order.receiverPhone,
      (order as any).email ?? (order as any).senderEmail ?? '',
      `${order.senderName || ''} ${order.receiverName || ''}`.trim(),
    );

    await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method: 'VNPAY',
      amount,
      status: 'pending',
      transactionId: order.waybill || order._id.toString(),
    });

    return { success: true, payUrl };
  }

  // IPN URL – VNPAY gọi phương thức GET
  @Get('ipn')
  @Public()
  async ipn(@Query() query: any, @Res() res: Response) {
    const result = await this.handleCallback(query);
    return res.status(HttpStatus.OK).json(result);
  }

  // Return URL – Người dùng thấy sau khi thanh toán
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

  // Xử lý chung cho cả IPN và Return
  private async handleCallback(params: any) {
    const secureHash = params.vnp_SecureHash;
    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;

    if (!secureHash) {
      return { RspCode: '99', Message: 'Missing signature' };
    }

    const isValid = this.vnpayService.verifySignature(params, secureHash);
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

    if (responseCode === '00') {
      await this.paymentsService.updatePaymentStatus(
        orderId,
        'success',
        params,
      );
      return { RspCode: '00', Message: 'Confirm Success' };
    } else {
      await this.paymentsService.updatePaymentStatus(orderId, 'failed', params);
      return { RspCode: '02', Message: 'Payment failed' };
    }
  }
}
