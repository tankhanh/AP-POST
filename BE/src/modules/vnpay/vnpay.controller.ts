import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  BadRequestException,
  Param,
  Req,
  Res,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VnpayService } from './vnpay.service';
import { PaymentsService } from '../payments/payments.service';
import { Order, OrderDocument } from '../orders/schemas/order.schemas';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { Public } from 'src/health/decorator/customize';
import { ConfigService } from '@nestjs/config';
import { CreateVnpayPaymentDto } from './dto/create-vnpay-payment.dto';
import { IVNPayCreatePaymentResponse, IVNPayIpnVerifyResponse } from 'src/types/vnpay.types';

@Controller('payment/vnpay')
export class VnpayController {
  constructor(
    private readonly vnpayService: VnpayService,
    private readonly paymentsService: PaymentsService,
    private configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
  ) {}

  /**
   * Create VNPAY payment URL
   * POST /payment/vnpay/create
   */
  @Post('create')
  async createPayment(
    @Body() dto: CreateVnpayPaymentDto,
    @Req() req: Request,
  ): Promise<IVNPayCreatePaymentResponse> {
    try {
      const { orderId, amount: requestedAmount } = dto;

      if (!orderId) {
        throw new BadRequestException('orderId is required');
      }

      const order = await this.orderModel.findById(orderId).lean();
      if (!order) {
        throw new BadRequestException('Order not found');
      }

    if (order.isDeleted) {
      throw new BadRequestException('Order has been deleted');
    }

    // Calculate maximum amount that can be paid online for this order
    let maxAmount = 0;
    if (order.shippingFeePayer === 'SENDER') {
      maxAmount = (order.shippingFee || 0) + (order.codValue || 0);
    } else {
      maxAmount = order.shippingFee || 0;
    }

    if (maxAmount <= 0) {
      throw new BadRequestException('No amount to pay online');
    }

    // If the client requested a specific amount (partial/split payment), validate it
    let amountToPay = maxAmount;
    if (typeof requestedAmount === 'number') {
      const amt = Number(requestedAmount) || 0;
      if (amt <= 0) {
        throw new BadRequestException('Requested amount must be greater than 0');
      }
      if (amt > maxAmount) {
        throw new BadRequestException('Requested amount exceeds allowed online amount');
      }
      amountToPay = amt;
    }

      // Get IP address
      const ipAddress = this.getIpAddress(req);

      // Build return URL
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'https://ap-post.vercel.app';
      const returnUrl = `${frontendUrl}/payment/vnpay-return`;

      // Create payment URL
      const { paymentUrl, transactionCode } = await this.vnpayService.createPaymentUrl(
        orderId,
        amountToPay,
        `AP-Post Order ${order.waybill} - Shipping fee`,
        ipAddress,
        returnUrl,
      );

      return {
        success: true,
        message: 'Payment URL created successfully',
        data: {
          paymentUrl,
          transactionCode,
          amount: amountToPay,
          orderId,
        },
      };
    } catch (error) {
      console.error('Create VNPAY payment error:', error);
      // Re-throw a BadRequestException with the original message when possible
      throw new BadRequestException(error?.message || 'Failed to create payment');
    }
  }

  /**
   * VNPAY return URL (after payment processing)
   * GET /payment/vnpay/return
   */
  @Get('return')
  @Public()
  async returnFromPayment(@Query() query: Record<string, any>, @Res() res: Response) {
    try {
      const result = await this.vnpayService.verifyReturnUrl(query);

      if (result.success) {
        // Get payment to update its details
        const payment = await this.paymentModel.findOne({
          transactionId: result.transactionCode,
        });

        if (payment) {
          // Update payment status
          await this.paymentsService.updatePaymentStatusByTransaction(
            result.transactionCode,
            'paid',
          );
        }

        const frontendUrl =
          this.configService.get<string>('FRONTEND_URL') ||
          'https://ap-post.vercel.app';

        return res.redirect(
          `${frontendUrl}/payment/vnpay-return?status=success&transactionCode=${result.transactionCode}&amount=${result.amount}&orderId=${payment?.orderId || ''}`,
        );
      } else {
        const frontendUrl =
          this.configService.get<string>('FRONTEND_URL') ||
          'https://ap-post.vercel.app';

        return res.redirect(
          `${frontendUrl}/payment/vnpay-return?status=failed&message=${encodeURIComponent(
            result.message,
          )}&responseCode=${result.responseCode}`,
        );
      }
    } catch (error) {
      console.error('Return URL error:', error);
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'https://ap-post.vercel.app';

      return res.redirect(
        `${frontendUrl}/payment/vnpay-return?status=error&message=${encodeURIComponent(
          'An error occurred during payment verification',
        )}`,
      );
    }
  }

  /**
   * VNPAY IPN callback (webhook from VNPAY server)
   * POST /payment/vnpay/ipn
   */
  @Post('ipn')
  @Public()
  async handleIpn(@Body() body: Record<string, any>): Promise<IVNPayIpnVerifyResponse> {
    const result = await this.vnpayService.verifyIpn(body);

    return {
      RspCode: result.RspCode,
      Message: result.Message,
    };
  }

  /**
   * Get payment details
   * GET /payment/vnpay/:transactionCode
   */
  @Get(':transactionCode')
  async getPaymentDetails(@Param('transactionCode') transactionCode: string) {
    const payment = await this.vnpayService.getPaymentDetails(transactionCode);

    return {
      success: true,
      data: payment,
    };
  }

  /**
   * Cancel payment
   * POST /payment/vnpay/:transactionCode/cancel
   */
  @Post(':transactionCode/cancel')
  async cancelPayment(@Param('transactionCode') transactionCode: string) {
    const result = await this.vnpayService.cancelPayment(transactionCode);

    return {
      success: true,
      message: result.message,
    };
  }

  /**
   * Get IP address from request
   */
  private getIpAddress(req: Request): string {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.connection.remoteAddress as string) ||
      'unknown';

    return ipAddress.includes('::ffff:') ? ipAddress.substring(7) : ipAddress;
  }
}