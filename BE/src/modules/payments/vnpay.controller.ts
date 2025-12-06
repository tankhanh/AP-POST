// src/modules/payments/vnpay.controller.ts
import {
  Controller,
  Post,
  Body,
  Query,
  Req,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { VnpayService } from './vnpay.service';
import { PaymentsService } from './payments.service';
import { InjectModel } from '@nestjs/mongoose';
import { Order } from '../orders/schemas/order.schemas';
import { Model } from 'mongoose';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
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
  async create(@Body() body: { orderId: string }) {
    if (!body.orderId) throw new BadRequestException('orderId is required');

    const order = await this.orderModel.findById(body.orderId).lean(); // .lean() để nhanh
    if (!order) throw new BadRequestException('Đơn hàng không tồn tại');

    const amount =
      order.senderPayAmount || order.totalOrderValue || order.shippingFee || 0;

    // Gọi build với optional từ order (theo doc)
    const payUrl = this.vnpayService.buildPaymentUrl(
      order.waybill || order._id.toString(),
      amount,
      `Thanh toan don ${order.waybill || order._id}`, // Không dấu theo doc
      order.receiverPhone, // billMobile
      order.email, // billEmail
      `${order.senderName} ${order.receiverName}`, // billFullName
      // Thêm các optional khác nếu cần
    );

    console.log('VNPay URL theo doc:', payUrl);

    await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method: 'VNPAY',
      amount,
      status: 'pending',
    });

    return { success: true, payUrl };
  }

  // Theo doc: Hỗ trợ GET/POST cho cả IPN và Return (VNPAY gọi GET cho IPN)
  @Get('ipn')
  @Post('ipn')
  @Get('return')
  @Post('return')
  @Public()
  async callback(@Body() body: any, @Query() query: any, @Req() req: Request) {
    console.log('VNPAY CALLBACK theo doc:', {
      body,
      query,
      method: req.method,
    });

    const params = { ...req.query, ...body };
    const secureHash = params.vnp_SecureHash as string;

    if (!secureHash) {
      return { RspCode: '99', Message: 'Missing signature' }; // Theo doc
    }

    // Xóa hash theo doc
    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;

    // Verify theo doc
    const isValid = this.vnpayService.verifySignature(params, secureHash);
    if (!isValid) {
      return { RspCode: '97', Message: 'Invalid signature' }; // Theo doc
    }

    const orderId = params.vnp_TxnRef;
    const responseCode = params.vnp_ResponseCode;
    const transactionStatus = params.vnp_TransactionStatus; // Theo doc IPN

    // Theo doc: Kiểm tra order tồn tại, amount match, status pending
    const order = await this.orderModel.findOne({ waybill: orderId }).lean();
    if (!order) {
      return { RspCode: '01', Message: 'Order not found' }; // Theo doc
    }
    if (
      parseInt(params.vnp_Amount) / 100 !==
      (order.senderPayAmount || order.totalOrderValue)
    ) {
      return { RspCode: '04', Message: 'Invalid amount' }; // Theo doc
    }
    if (transactionStatus !== '0') {
      // Đã confirm rồi
      return { RspCode: '02', Message: 'Order already confirmed' }; // Theo doc
    }

    if (responseCode === '00' && transactionStatus === '00') {
      // Thành công theo doc
      await this.paymentsService.updatePaymentStatus(
        orderId,
        'success',
        params,
      );
      console.log('Thanh toán thành công theo doc:', orderId);
    } else {
      await this.paymentsService.updatePaymentStatus(orderId, 'failed', params);
    }

    // Theo doc: Response đúng format cho IPN
    return { RspCode: '00', Message: 'Confirm Success' };
  }
}
