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
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';

@Controller('payment')
export class FakePaymentController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private paymentsService: PaymentsService,
    private fakePaymentService: FakePaymentService,
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
  ) {}

  @Post('card')
  @Public()
  async create(@Body() body: { orderId: string; cardData?: any }) {
    const { orderId, cardData } = body;
    if (!orderId) throw new BadRequestException('orderId required');
    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new BadRequestException('Order not found');
    if (order.isDeleted) throw new BadRequestException('Đơn hàng đã bị xóa');

    let amountToPay = 0;
    if (order.shippingFeePayer === 'SENDER') {
      amountToPay = (order.shippingFee || 0) + (order.codValue || 0);
    } else {
      amountToPay = order.shippingFee || 0;
    }
    if (amountToPay <= 0) {
      throw new BadRequestException('Không có tiền cần thanh toán online');
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      'https://ap-post.vercel.app';
    const returnUrl = `${frontendUrl}/payment-success`;

    // Build payload early (used for both paths if needed)
    const payload = this.fakePaymentService.buildPaymentPayload(
      orderId,
      amountToPay,
      `Order ${order.waybill} - Shipping fee`,
      order,
      cardData,
      returnUrl,
    );

    if (!cardData) {
      // Nếu không có cardData → yêu cầu frontend hiện form (no payment creation here)
      return {
        success: true,
        requireCardInput: true,
        message: 'Vui lòng nhập thông tin thẻ để hoàn tất thanh toán',
        redirectUrl: null,
      };
    } else {
      // Nếu có cardData → ensure pending payment exists (safe upsert if missing)
      const paymentData = {
        orderId,
        amount: amountToPay,
        method: 'FAKE',
        status: 'pending',
        transactionId: order.waybill,
      };
      const existingPayment = await this.paymentModel.findOneAndUpdate(
        { transactionId: order.waybill },
        paymentData,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // Gọi gateway
      try {
        console.log('Sending payload to gateway:', JSON.stringify(payload));

        const response = await lastValueFrom(
          this.httpService.post(
            'https://fake-payment-tkh.onrender.com/api/v1/payment/card',
            payload,
          ),
        );

        // ĐÚNG RỒI: response.data chính là object { success: true, message: "...", data: {...} }
        const gatewayResponse = response.data;

        console.log('Gateway response:', gatewayResponse);

        // Kiểm tra success đúng cách
        if (gatewayResponse.success === true) {
          await this.paymentsService.updatePaymentStatusByTransaction(
            order.waybill,
            'paid',
          );
          await this.orderModel.updateOne(
            { _id: orderId },
            { status: 'CONFIRMED' },
          );

          return {
            success: true,
            message: 'Thanh toán thành công (fake)',
            redirectUrl: `${returnUrl}?status=paid&msg=${encodeURIComponent(
              'Thanh toán thành công',
            )}`,
          };
        } else {
          await this.paymentsService.updatePaymentStatusByTransaction(
            order.waybill,
            'failed',
          );
          return {
            success: false,
            message: gatewayResponse.message || 'Thanh toán thất bại',
            redirectUrl: `${returnUrl}?status=failed&msg=${encodeURIComponent(
              gatewayResponse.message || 'Lỗi không xác định',
            )}`,
          };
        }
      } catch (err: any) {
        await this.paymentsService.updatePaymentStatusByTransaction(
          order.waybill,
          'failed',
        );
        console.error('Gateway error:', err.response?.data || err.message);
        throw new BadRequestException('Lỗi kết nối gateway');
      }
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
