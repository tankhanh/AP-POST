import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schemas';
import { PaymentsService } from '../payments/payments.service';
import { IVNPayResponse, IVNPayVerifyResponse, IVNPayIpnVerifyResponse, IVNPayCreatePaymentResponse } from 'src/types/vnpay.types';

@Injectable()
export class VnpayService {
  private vnpayUrl: string;
  private tmnCode: string;
  private hashSecret: string;
  private orderInfo: string;
  private orderType: string;
  private locale: string;
  private currency: string;

  constructor(
    private configService: ConfigService,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private paymentsService: PaymentsService,
  ) {
    this.vnpayUrl = this.configService.get<string>('VNPAY_URL');
    this.tmnCode = this.configService.get<string>('VNPAY_TMN_CODE');
    this.hashSecret = this.configService.get<string>('VNPAY_HASH_SECRET');
    this.orderInfo = this.configService.get<string>('VNPAY_ORDER_INFO') || 'Bill Payment';
    this.orderType = this.configService.get<string>('VNPAY_ORDER_TYPE') || 'Bake Payment';
    this.locale = this.configService.get<string>('VNPAY_LOCALE') || 'vn';
    this.currency = this.configService.get<string>('VNPAY_CURRENCY') || 'VND';
  }

  /**
   * Create VNPAY payment URL
   */
  async createPaymentUrl(
    orderId: string,
    amount: number,
    orderDescription: string,
    ipAddress: string,
    returnUrl: string,
  ): Promise<{ paymentUrl: string; transactionCode: string }> {
    const order = await this.orderModel.findById(orderId).lean();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Generate transaction code
    const transactionCode = this.generateTransactionCode(order.waybill || orderId);

    // Create payment record as pending
    const payment = await this.paymentModel.create({
      orderId,
      amount,
      method: 'VNPAY',
      status: 'pending',
      transactionId: transactionCode,
    });

    // Create VNPAY payment URL
    const paymentUrl = this.buildPaymentUrl(
      transactionCode,
      amount,
      orderDescription,
      ipAddress,
      returnUrl,
    );

    return {
      paymentUrl,
      transactionCode,
    };
  }

  /**
   * Build VNPAY payment URL
   */
  private buildPaymentUrl(
    transactionCode: string,
    amount: number,
    orderDescription: string,
    ipAddress: string,
    returnUrl: string,
  ): string {
    const vnp_Params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Locale: this.locale,
      vnp_CurrCode: this.currency,
      vnp_TxnRef: transactionCode,
      vnp_OrderInfo: this.orderInfo,
      vnp_OrderType: this.orderType,
      vnp_Amount: (amount * 100).toString(), // VNPAY requires amount in hundredth VND


      vnp_ReturnUrl: returnUrl || 'https://ap-post.vercel.app/payment/vnpay-return',
      vnp_IpAddr: ipAddress,
      vnp_CreateDate: this.getCurrentTimeString(),
    };

    // Sort parameters by key
    const sortedParams = this.sortObject(vnp_Params);

    // Build query string
    let signInput = '';
    Object.keys(sortedParams).forEach((key) => {
      signInput += `&${key}=${sortedParams[key]}`;
    });
    signInput = signInput.substring(1);

    // Create signature
    const signature = crypto
      .createHmac('sha512', this.hashSecret)
      .update(signInput)
      .digest('hex');

    const paymentUrl = `${this.vnpayUrl}?${signInput}&vnp_SecureHash=${signature}`;
    return paymentUrl;
  }

  /**
   * Verify VNPAY callback/return
   */
  async verifyReturnUrl(queryData: Record<string, any>): Promise<{
    success: boolean;
    orderId?: string;
    transactionCode?: string;
    amount?: number;
    message?: string;
    responseCode?: string;
  }> {
    try {
      // Validate required fields
      if (!queryData.vnp_SecureHash) {
        return {
          success: false,
          message: 'Missing secure hash',
        };
      }

      const vnp_SecureHash = queryData.vnp_SecureHash;

      // Remove secure hash from params to verify signature
      const verifyParams = { ...queryData };
      delete verifyParams.vnp_SecureHash;

      // Sort and build input string
      const sortedParams = this.sortObject(verifyParams);
      let signInput = '';
      Object.keys(sortedParams).forEach((key) => {
        signInput += `&${key}=${sortedParams[key]}`;
      });
      signInput = signInput.substring(1);

      // Verify signature
      const computedHash = crypto
        .createHmac('sha512', this.hashSecret)
        .update(signInput)
        .digest('hex');

      if (computedHash !== vnp_SecureHash) {
        return {
          success: false,
          message: 'Invalid signature',
        };
      }

      // Verify response code (0 = success)
      const responseCode = queryData.vnp_ResponseCode;
      const transactionCode = queryData.vnp_TxnRef;
      const amount = queryData.vnp_Amount ? parseInt(queryData.vnp_Amount) / 100 : 0;

      if (responseCode === '00') {
        // Payment successful
        return {
          success: true,
          transactionCode,
          amount,
          responseCode,
          message: 'Payment successful',
        };
      } else {
        // Payment failed
        return {
          success: false,
          transactionCode,
          responseCode,
          message: `Payment failed with code: ${responseCode}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Verification error: ${error}`,
      };
    }
  }

  /**
   * Verify IPN callback from VNPAY
   */
  async verifyIpn(queryData: Record<string, any>): Promise<{
    RspCode: string;
    Message: string;
  }> {
    try {
      // Validate required fields
      if (!queryData.vnp_SecureHash) {
        return {
          RspCode: '97',
          Message: 'Invalid signature',
        };
      }

      const vnp_SecureHash = queryData.vnp_SecureHash;

      // Remove secure hash from params to verify signature
      const verifyParams = { ...queryData };
      delete verifyParams.vnp_SecureHash;

      // Sort and build input string
      const sortedParams = this.sortObject(verifyParams);
      let signInput = '';
      Object.keys(sortedParams).forEach((key) => {
        signInput += `&${key}=${sortedParams[key]}`;
      });
      signInput = signInput.substring(1);

      // Verify signature
      const computedHash = crypto
        .createHmac('sha512', this.hashSecret)
        .update(signInput)
        .digest('hex');

      if (computedHash !== vnp_SecureHash) {
        return {
          RspCode: '97',
          Message: 'Invalid signature',
        };
      }

      const transactionCode = queryData.vnp_TxnRef;
      const responseCode = queryData.vnp_ResponseCode;
      const orderId = queryData.vnp_OrderInfo;

      // Check if transaction exists
      const payment = await this.paymentModel.findOne({
        transactionId: transactionCode,
      });

      if (!payment) {
        return {
          RspCode: '01',
          Message: 'Transaction not found',
        };
      }

      // Check if already processed
      if (payment.status === 'paid') {
        return {
          RspCode: '02',
          Message: 'Transaction already confirmed',
        };
      }

      // Process payment
      if (responseCode === '00') {
        // Update payment status to paid
        await this.paymentModel.updateOne(
          { transactionId: transactionCode },
          {
            status: 'paid',
            updatedAt: new Date(),
          },
        );

        // Update order status
        await this.orderModel.updateOne(
          { _id: payment.orderId },
          { status: OrderStatus.CONFIRMED },
        );

        return {
          RspCode: '00',
          Message: 'Confirm success',
        };
      } else {
        // Payment failed
        await this.paymentModel.updateOne(
          { transactionId: transactionCode },
          {
            status: 'failed',
            updatedAt: new Date(),
          },
        );

        return {
          RspCode: '01',
          Message: `Payment failed with code: ${responseCode}`,
        };
      }
    } catch (error) {
      console.error('IPN verification error:', error);
      return {
        RspCode: '99',
        Message: 'Unspecified error',
      };
    }
  }

  /**
   * Get payment details by transaction code
   */
  async getPaymentDetails(transactionCode: string) {
    const payment = await this.paymentModel.findOne({
      transactionId: transactionCode,
    }).lean();

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Fetch order details to include full order info
    const order = await this.orderModel.findById(payment.orderId).lean();

    return {
      ...payment,
      orderId: payment.orderId,
      order: order || null,
    };
  }

  /**
   * Cancel payment
   */
  async cancelPayment(transactionCode: string): Promise<any> {
    const payment = await this.paymentModel.findOne({
      transactionId: transactionCode,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'paid') {
      throw new BadRequestException('Cannot cancel paid payment');
    }

    await this.paymentModel.updateOne(
      { transactionId: transactionCode },
      {
        status: 'failed',
        updatedAt: new Date(),
      },
    );

    return { message: 'Payment cancelled successfully' };
  }

  /**
   * Generate transaction code
   */
  private generateTransactionCode(orderId: string): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${orderId}-${timestamp}-${random}`.substring(0, 50);
  }

  /**
   * Get current time string
   */
  private getCurrentTimeString(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}${second}`;
  }

  /**
   * Sort object by keys
   */
  private sortObject(obj: Record<string, any>): Record<string, any> {
    const sorted = {};
    const keys = Object.keys(obj).sort();
    keys.forEach((key) => {
      sorted[key] = obj[key];
    });
    return sorted;
  }
}