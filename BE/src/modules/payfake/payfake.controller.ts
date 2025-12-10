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

@Controller('payment')
export class FakePaymentController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private paymentsService: PaymentsService,
    private fakePaymentService: FakePaymentService,
    private configService: ConfigService,
  ) { }

  @Post('card')
  @Public()
  async create(@Body() body: { orderId: string }) {
    const { orderId } = body;
    if (!orderId) throw new BadRequestException('orderId required');

    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new BadRequestException('Order not found');
    if (order.isDeleted) throw new BadRequestException('Đơn hàng đã bị xóa');

    // TỰ ĐỘNG TÍNH TIỀN NGƯỜI GỬI PHẢI TRẢ KHI DÙNG FAKE (để test dễ)
    let amountToPay = 0;

    if (order.shippingFeePayer === 'SENDER') {
      amountToPay = order.senderPayAmount;                    // ví dụ: 40000
    } else {
      amountToPay = order.shippingFee;                        // nếu người nhận trả phí thì vẫn thu phí trước
    }

    // Nếu muốn test thu hết luôn cả COD thì dùng dòng này thay 2 dòng trên:
    // amountToPay = order.senderPayAmount; // hoặc order.totalOrderValue

    if (amountToPay <= 0) {
      throw new BadRequestException('Không có tiền cần thanh toán online');
    }

    // Tạo payment pending trước
    await this.paymentsService.createPaymentForOrder(orderId, {
      method: 'FAKE',
      amount: amountToPay,
      status: 'pending',
      transactionId: order.waybill,
      createdBy: null,
    });

    const result = this.fakePaymentService.buildPaymentUrl(
      orderId,
      amountToPay,
      `Thanh toán đơn ${order.waybill || orderId} – APPost`,
    );

    return {
      success: true,
      message: 'Đang chuyển hướng đến cổng thanh toán giả lập...',
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
