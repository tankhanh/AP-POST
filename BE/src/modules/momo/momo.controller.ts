import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from 'src/health/decorator/customize';
import { PaymentsService } from '../payments/payments.service';
import { MomoService } from './momo.service';
import { PaymentStatus } from '../payments/schemas/payment.schema';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';

class RetryMomoPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  transactionCode: string;
}

@Controller('payments/momo')
export class MomoController {
  private readonly logger = new Logger(MomoController.name);

  constructor(
    private readonly momoService: MomoService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('ipn')
  @Public()
  @HttpCode(204)
  async handleIpn(@Body() body: Record<string, unknown>): Promise<void> {
    const { signature, ...signedFields } = body;
    if (
      !this.momoService.isExpectedPartner(body.partnerCode) ||
      !this.momoService.verifyCallbackSignature(signedFields, signature)
    ) {
      throw new UnauthorizedException('Invalid MoMo signature');
    }

    const orderId = String(body.orderId ?? '');
    const payment = await this.paymentsService.findByTransactionId(orderId);
    if (!payment) throw new BadRequestException('Payment not found');
    if (Number(body.amount) !== payment.amount) {
      throw new BadRequestException('Payment amount mismatch');
    }

    const attempt = payment.attempts?.find(
      (item) => item.transactionId === orderId,
    );
    if (
      attempt?.requestId &&
      String(body.requestId ?? '') !== attempt.requestId
    ) {
      throw new BadRequestException('MoMo request ID mismatch');
    }

    const resultCode = Number(body.resultCode);
    const status = this.momoService.isSuccessfulResultCode(resultCode)
      ? PaymentStatus.PAID
      : this.momoService.isPendingResultCode(resultCode)
        ? PaymentStatus.PENDING
        : PaymentStatus.FAILED;
    if (status === PaymentStatus.PENDING) {
      await this.paymentsService.recordGatewayCheck(orderId, {
        responseCode: String(body.resultCode ?? ''),
        responseMessage: String(body.message ?? ''),
        providerTransactionId: String(body.transId ?? ''),
      });
      return;
    }
    if (payment.status !== status) {
      await this.paymentsService.updatePaymentStatusByTransaction(
        orderId,
        status,
        {
          responseCode: String(body.resultCode ?? ''),
          responseMessage: String(body.message ?? ''),
          providerTransactionId: String(body.transId ?? ''),
        },
      );
    }
    this.logger.log(`Processed MoMo IPN for order ${orderId}: ${status}`);
  }

  @Get('return')
  @Public()
  async handleReturn(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const { signature, ...signedFields } = query;
    const valid =
      this.momoService.isExpectedPartner(query.partnerCode) &&
      this.momoService.verifyCallbackSignature(signedFields, signature);
    const orderId = String(query.orderId ?? query.requestId ?? '');
    const resultCode = valid ? Number(query.resultCode ?? -1) : -1;
    const frontendUrl = this.configService
      .get<string>('FRONTEND_URL', 'https://ap-post.vercel.app')
      .replace(/\/$/, '');

    if (
      valid &&
      this.momoService.isSuccessfulResultCode(resultCode) &&
      orderId
    ) {
      const payment = await this.paymentsService.findByTransactionId(orderId);
      const callbackAmount = Number(query.amount);
      if (
        payment &&
        callbackAmount === payment.amount &&
        payment.status !== PaymentStatus.PAID
      ) {
        await this.paymentsService.updatePaymentStatusByTransaction(
          orderId,
          PaymentStatus.PAID,
          {
            responseCode: String(resultCode),
            responseMessage: String(query.message ?? 'Payment successful'),
            providerTransactionId: String(query.transId ?? ''),
          },
        );
      }
    }

    return response.redirect(
      `${frontendUrl}/payment/success?orderId=${encodeURIComponent(
        orderId,
      )}&transactionCode=${encodeURIComponent(
        orderId,
      )}&resultCode=${resultCode}&method=momo`,
    );
  }

  @Post('retry')
  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async retryPayment(@Body() dto: RetryMomoPaymentDto) {
    const result = await this.momoService.retryPaymentUrl(dto.transactionCode);
    return { success: true, data: result };
  }

  @Get('status/:orderId')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async getStatus(
    @Param('orderId') orderId: string,
    @Query('reconcile') reconcile?: string,
  ) {
    let reconciliation: 'not_requested' | 'completed' | 'unavailable' =
      'not_requested';
    if (reconcile === 'true') {
      try {
        await this.momoService.queryPaymentStatus(orderId);
        reconciliation = 'completed';
      } catch (error) {
        reconciliation = 'unavailable';
        this.logger.warn(
          `MoMo reconciliation unavailable for ${orderId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    const payment = await this.paymentsService.getRecoveryStatus(orderId);
    if (!payment) throw new BadRequestException('Payment not found');
    return {
      orderId: payment.orderId,
      transactionCode: orderId,
      status: payment.status,
      amount: payment.amount,
      expiresAt: payment.expiresAt ?? null,
      reconciliation,
    };
  }
}
