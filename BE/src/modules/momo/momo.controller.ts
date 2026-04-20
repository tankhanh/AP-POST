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
    console.log('📨 Momo IPN received:', JSON.stringify(body, null, 2));

    const { signature, ...params } = body;

    // Verify chữ ký
    if (!this.momoService.verifySignature(params, signature)) {
      console.error('❌ Momo IPN: Invalid signature');
      return { message: 'Invalid signature' };
    }

    const orderId = body.orderId || body.requestId; // MoMo có thể trả về orderId hoặc requestId
    const resultCode = Number(body.resultCode);
    const amount = Number(body.amount);

    console.log(
      `🔄 IPN OrderId: ${orderId}, ResultCode: ${resultCode}, Amount: ${amount}`,
    );

    if (resultCode === 0) {
      // Thanh toán thành công
      console.log(`✅ Momo thanh toán thành công cho order: ${orderId}`);

      try {
        // Cập nhật Payment
        await this.paymentsService.updatePaymentStatusByTransaction(
          orderId,
          'paid',
        );

        // Cập nhật Order thành CONFIRMED
        await this.ordersService.updateStatus(orderId, OrderStatus.CONFIRMED);
        console.log(`✅ Đơn hàng ${orderId} đã chuyển sang CONFIRMED`);
      } catch (err) {
        console.error('❌ Lỗi cập nhật trạng thái đơn hàng hoặc payment:', err);
      }
    } else {
      console.log(
        `❌ Momo thanh toán thất bại. ResultCode: ${resultCode} - Message: ${body.message}`,
      );
    }

    // MoMo yêu cầu phải trả về { message: 'success' } hoặc tương tự
    return { message: 'success' };
  }

  // Return URL - Người dùng được redirect về sau khi thanh toán
  // src/momo/momo.controller.ts

  // Return URL - Người dùng được redirect về sau khi thanh toán
  @Get('return')
  @Public()
  async handleReturn(@Query() query: any, @Res() res: Response) {
    const orderId = query.orderId || query.requestId;
    const resultCode = Number(query.resultCode || -1);

    console.log('🔄 [MOMO RETURN URL] Full Query:', query);
    console.log(
      `🔄 [MOMO RETURN URL] OrderId: ${orderId}, ResultCode: ${resultCode}`,
    );

    if (resultCode === 0 && orderId) {
      console.log(
        `✅ [RETURN URL] Bắt đầu cập nhật thanh toán cho order: ${orderId}`,
      );

      try {
        // Cập nhật Payment
        const payment =
          await this.paymentsService.updatePaymentStatusByTransaction(
            orderId,
            'paid',
          );
        console.log(
          `✅ [RETURN URL] Payment updated: ${payment ? 'OK' : 'NOT FOUND'}`,
        );

        // Cập nhật Order thành CONFIRMED
        await this.ordersService.updateStatus(orderId, OrderStatus.CONFIRMED);
        console.log(
          `🎉 [RETURN URL] Order ${orderId} đã chuyển sang CONFIRMED`,
        );
      } catch (err: any) {
        console.error('❌ [RETURN URL] Lỗi khi cập nhật:', err.message);
      }
    } else {
      console.warn(
        `⚠️ [RETURN URL] Thanh toán không thành công hoặc thiếu orderId. ResultCode = ${resultCode}`,
      );
    }

    // Redirect về trang success
    const frontendUrl = `https://ap-post.vercel.app/payment/success?orderId=${orderId}&resultCode=${resultCode}&method=momo`;
    return res.redirect(frontendUrl);
  }
}
