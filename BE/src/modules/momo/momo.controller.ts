import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import { MomoService } from './momo.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { Public } from 'src/health/decorator/customize';
import { Response } from 'express';
import { OrderStatus } from '../orders/schemas/order.schemas';

@Controller('payments/momo')
export class MomoController {
  constructor(
    private momoService: MomoService,
    private paymentsService: PaymentsService,
    private ordersService: OrdersService,
  ) {}

  // IPN - Momo gọi về khi thanh toán thành công / thất bại
  @Post('ipn')
  @Public()
  async handleIpn(@Body() body: any) {
    console.log('📨 Momo IPN received:', body);

    const { signature, ...params } = body;

    // Verify chữ ký
    if (!this.momoService.verifySignature(params, signature)) {
      console.error('❌ Momo IPN: Invalid signature');
      return { message: 'Invalid signature' };
    }

    const orderId = body.orderId || body.requestId;
    const resultCode = Number(body.resultCode);

    if (resultCode === 0) {
      // Thanh toán thành công
      console.log(`✅ Momo thanh toán thành công cho order: ${orderId}`);

      // Cập nhật Payment
      await this.paymentsService.updatePaymentStatusByTransaction(orderId, 'paid');

      // Cập nhật Order thành CONFIRMED
      try {
        await this.ordersService.updateStatus(orderId, OrderStatus.CONFIRMED);
        console.log(`✅ Đơn hàng ${orderId} đã chuyển sang CONFIRMED`);
      } catch (err) {
        console.error('❌ Lỗi cập nhật trạng thái đơn hàng:', err);
      }
    } else {
      console.log(`❌ Momo thanh toán thất bại. ResultCode: ${resultCode}`);
    }

    // Momo yêu cầu phải trả về { message: 'success' } hoặc tương tự
    return { message: 'success' };
  }

  // Return URL - Người dùng được redirect về sau khi thanh toán
  @Get('return')
  @Public()
  async handleReturn(@Query() query: any, @Res() res: Response) {
    const orderId = query.orderId || query.requestId;
    const resultCode = query.resultCode;

    console.log('🔄 Momo Return URL:', { orderId, resultCode });

    // Redirect về trang success của frontend
    const frontendUrl = `https://ap-post.vercel.app/payment/success?orderId=${orderId}&method=momo&resultCode=${resultCode}`;

    return res.redirect(frontendUrl);
  }
}