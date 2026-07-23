import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schemas';
import { PaymentsService } from '../payments/payments.service';
import { PaymentMethod } from '../payments/payment.constants';
import {
  PaymentDocument,
  PaymentStatus,
} from '../payments/schemas/payment.schema';

type MomoCallback = Record<string, unknown>;

export class MomoInitiationError extends Error {
  constructor(
    message: string,
    readonly transactionCode: string,
  ) {
    super(message);
    this.name = 'MomoInitiationError';
  }
}

@Injectable()
export class MomoService {
  private readonly partnerCode: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly endpoint: string;
  private readonly queryEndpoint: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly paymentsService: PaymentsService,
  ) {
    this.partnerCode = this.configService.get<string>('MOMO_PARTNER_CODE', '');
    this.accessKey = this.configService.get<string>('MOMO_ACCESS_KEY', '');
    this.secretKey = this.configService.get<string>('MOMO_SECRET_KEY', '');
    this.endpoint = this.configService.get<string>(
      'MOMO_ENDPOINT',
      'https://test-payment.momo.vn/v2/gateway/api/create',
    );
    this.queryEndpoint = this.configService.get<string>(
      'MOMO_QUERY_ENDPOINT',
      'https://test-payment.momo.vn/v2/gateway/api/query',
    );
  }

  async createPayment(
    orderId: string,
    amount: number,
    orderInfo: string,
  ): Promise<{
    payUrl: string;
    transactionCode: string;
    requestId: string;
    expiresAt: Date;
  }> {
    this.assertConfigured();
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1_000 ||
      amount > 50_000_000
    ) {
      throw new BadRequestException(
        'MoMo amount must be an integer from 1,000 to 50,000,000 VND',
      );
    }

    const order = await this.orderModel
      .findOne({ _id: orderId, isDeleted: false })
      .lean();
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentMethod !== PaymentMethod.MOMO) {
      throw new BadRequestException('Order is not configured for MoMo');
    }
    const expectedAmount = Number(order.senderPayAmount || 0);
    if (amount !== expectedAmount) {
      throw new BadRequestException('Payment amount does not match the order');
    }

    const transactionCode = this.generateTransactionCode();
    const requestId = transactionCode;
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.paymentsService.prepareGatewayPayment(
      orderId,
      PaymentMethod.MOMO,
      amount,
      transactionCode,
      { requestId, expiresAt },
    );

    const apiBaseUrl = this.configService
      .get<string>('API_BASE_URL', 'https://ap-post-api.onrender.com/api/v1')
      .replace(/\/$/, '');
    const redirectUrl = `${apiBaseUrl}/payments/momo/return`;
    const ipnUrl = `${apiBaseUrl}/payments/momo/ipn`;
    const extraData = '';
    const requestType = 'payWithMethod';

    const rawSignature =
      `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}` +
      `&ipnUrl=${ipnUrl}&orderId=${transactionCode}&orderInfo=${orderInfo}` +
      `&partnerCode=${this.partnerCode}&redirectUrl=${redirectUrl}` +
      `&requestId=${requestId}&requestType=${requestType}`;
    const signature = createHmac('sha256', this.secretKey)
      .update(rawSignature)
      .digest('hex');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.endpoint,
          {
            partnerCode: this.partnerCode,
            partnerName: 'AP Post',
            storeId: 'APPostStore',
            requestId,
            amount: amount.toString(),
            orderId: transactionCode,
            orderInfo,
            redirectUrl,
            ipnUrl,
            extraData,
            requestType,
            orderExpireTime: 15,
            signature,
            lang: 'vi',
          },
          { timeout: 30_000, maxContentLength: 256_000 },
        ),
      );
      const data = response.data;

      if (data?.resultCode !== 0 || typeof data?.payUrl !== 'string') {
        await this.paymentsService.updatePaymentStatusByTransaction(
          transactionCode,
          PaymentStatus.FAILED,
          {
            responseCode: String(data?.resultCode ?? 'INVALID_RESPONSE'),
            responseMessage: String(
              data?.message || 'Invalid gateway response',
            ),
          },
        );
        throw new MomoInitiationError(
          `MoMo error: ${data?.message || 'Invalid gateway response'}`,
          transactionCode,
        );
      }

      return { payUrl: data.payUrl, transactionCode, requestId, expiresAt };
    } catch (error) {
      if (error instanceof MomoInitiationError) throw error;
      // A timeout is ambiguous: MoMo may have created the transaction even
      // though this server did not receive the URL. Keep it pending so a late
      // IPN/query can still settle it safely.
      await this.paymentsService.recordGatewayCheck(transactionCode, {
        responseCode: 'INIT_UNKNOWN',
        responseMessage:
          error instanceof Error ? error.message : 'MoMo request failed',
      });
      throw new MomoInitiationError(
        'Không nhận được phản hồi khởi tạo từ MoMo',
        transactionCode,
      );
    }
  }

  async retryPaymentUrl(transactionCode: string): Promise<{
    payUrl: string;
    transactionCode: string;
    requestId: string;
    expiresAt: Date;
    orderId: string;
    amount: number;
  }> {
    const payment =
      await this.paymentsService.findByTransactionId(transactionCode);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.method !== PaymentMethod.MOMO) {
      throw new BadRequestException('Payment is not a MoMo transaction');
    }
    if (
      payment.status === PaymentStatus.PAID ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException('Payment has already been completed');
    }
    const order = await this.orderModel
      .findOne({ _id: payment.orderId, isDeleted: false })
      .lean();
    if (!order) throw new NotFoundException('Order not found');
    const amount = Number(order.senderPayAmount || 0);
    const result = await this.createPayment(
      String(payment.orderId),
      amount,
      `AP Post ${order.waybill || payment.orderId}`,
    );
    return { ...result, orderId: String(payment.orderId), amount };
  }

  async queryPaymentStatus(transactionCode: string): Promise<PaymentDocument> {
    this.assertConfigured();
    const payment =
      await this.paymentsService.findByTransactionId(transactionCode);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.method !== PaymentMethod.MOMO) {
      throw new BadRequestException('Payment is not a MoMo transaction');
    }
    if (
      payment.status === PaymentStatus.PAID ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return payment;
    }

    const requestId = this.generateTransactionCode();
    const rawSignature =
      `accessKey=${this.accessKey}&orderId=${transactionCode}` +
      `&partnerCode=${this.partnerCode}&requestId=${requestId}`;
    const signature = createHmac('sha256', this.secretKey)
      .update(rawSignature)
      .digest('hex');
    const response = await firstValueFrom(
      this.httpService.post(
        this.queryEndpoint,
        {
          partnerCode: this.partnerCode,
          requestId,
          orderId: transactionCode,
          lang: 'vi',
          signature,
        },
        { timeout: 30_000, maxContentLength: 256_000 },
      ),
    );
    const data = response.data as Record<string, unknown>;
    if (
      String(data.partnerCode ?? '') !== this.partnerCode ||
      String(data.orderId ?? '') !== transactionCode
    ) {
      throw new BadRequestException('Invalid MoMo query response');
    }
    if (data.amount !== undefined && Number(data.amount) !== payment.amount) {
      throw new BadRequestException('MoMo query amount mismatch');
    }

    const resultCode = Number(data.resultCode);
    const metadata = {
      responseCode: String(data.resultCode ?? ''),
      responseMessage: String(data.message ?? ''),
      providerTransactionId: String(data.transId ?? ''),
      lastCheckedAt: new Date(),
    };
    if (this.isSuccessfulResultCode(resultCode)) {
      return (
        (await this.paymentsService.updatePaymentStatusByTransaction(
          transactionCode,
          PaymentStatus.PAID,
          metadata,
        )) ?? payment
      );
    }
    if (
      !this.isPendingResultCode(resultCode) &&
      this.isFinalFailure(resultCode)
    ) {
      return (
        (await this.paymentsService.updatePaymentStatusByTransaction(
          transactionCode,
          PaymentStatus.FAILED,
          metadata,
        )) ?? payment
      );
    }
    await this.paymentsService.recordGatewayCheck(transactionCode, metadata);
    return (
      (await this.paymentsService.getRecoveryStatus(transactionCode)) ?? payment
    );
  }

  verifyCallbackSignature(
    params: MomoCallback,
    receivedSignature: unknown,
  ): boolean {
    if (!this.secretKey || typeof receivedSignature !== 'string') return false;

    const value = (key: string) => String(params[key] ?? '');
    const rawSignature =
      `accessKey=${this.accessKey}&amount=${value('amount')}` +
      `&extraData=${value('extraData')}&message=${value('message')}` +
      `&orderId=${value('orderId')}&orderInfo=${value('orderInfo')}` +
      `&orderType=${value('orderType')}&partnerCode=${value('partnerCode')}` +
      `&payType=${value('payType')}&requestId=${value('requestId')}` +
      `&responseTime=${value('responseTime')}&resultCode=${value('resultCode')}` +
      `&transId=${value('transId')}`;
    const computed = createHmac('sha256', this.secretKey)
      .update(rawSignature)
      .digest();

    try {
      const received = Buffer.from(receivedSignature, 'hex');
      return (
        received.length === computed.length &&
        timingSafeEqual(received, computed)
      );
    } catch {
      return false;
    }
  }

  isExpectedPartner(partnerCode: unknown): boolean {
    return String(partnerCode ?? '') === this.partnerCode;
  }

  isSuccessfulResultCode(resultCode: unknown): boolean {
    return [0, 9000].includes(Number(resultCode));
  }

  isPendingResultCode(resultCode: unknown): boolean {
    return [1000, 7000, 7002].includes(Number(resultCode));
  }

  isConfigured(): boolean {
    return Boolean(this.partnerCode && this.accessKey && this.secretKey);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException('MoMo payment is not configured');
    }
  }

  private isFinalFailure(resultCode: number): boolean {
    return [
      98, 99, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1017, 1026, 4001, 4002,
      4100,
    ].includes(resultCode);
  }

  private generateTransactionCode(): string {
    return `MM${Date.now()}${randomBytes(12).toString('hex')}`.slice(0, 50);
  }
}
