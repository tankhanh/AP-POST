import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
} from './schemas/payment.schema';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../orders/schemas/order.schemas';
import { OrdersService } from '../orders/orders.service';
import { MANUAL_PAYMENT_METHODS, PaymentMethod } from './payment.constants';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
  ) {}

  async create(orderId: string, method: PaymentMethod) {
    const order = await this.orderModel.findOne({
      _id: orderId,
      isDeleted: false,
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentMethod !== method) {
      throw new BadRequestException('Payment method does not match the order');
    }

    let amount: number;
    if (method === 'CASH') {
      amount = order.senderPayAmount || order.receiverPayAmount;
    } else if (method === 'COD') {
      amount = order.receiverPayAmount;
    } else {
      amount = order.totalOrderValue;
    }

    if (!MANUAL_PAYMENT_METHODS.includes(method as never)) {
      throw new BadRequestException(
        'Payment method requires a gateway callback',
      );
    }

    const payment = await this.paymentModel.findOneAndUpdate(
      {
        orderId: order._id,
        status: { $ne: PaymentStatus.PAID },
        isDeleted: false,
      },
      {
        $set: {
          amount,
          method,
          status: PaymentStatus.PAID,
          updatedAt: new Date(),
        },
        $setOnInsert: { orderId: order._id, isDeleted: false },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await this.confirmOrderWhenPaid(payment);
    return payment;
  }

  async findAll() {
    return this.paymentModel
      .find({ isDeleted: false })
      .populate('orderId')
      .exec();
  }

  async findOne(id: string) {
    const payment = await this.paymentModel
      .findOne({ _id: id, isDeleted: false })
      .populate('orderId');
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async updateStatus(id: string, status: PaymentStatus) {
    const payment = await this.paymentModel.findOne({
      _id: id,
      isDeleted: false,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!MANUAL_PAYMENT_METHODS.includes(payment.method as never)) {
      throw new BadRequestException(
        'Online payments can only be updated by a verified gateway callback',
      );
    }
    return this.transitionPayment(payment, status);
  }

  async createPaymentForOrder(
    orderId: string,
    data: {
      method: PaymentMethod;
      amount: number;
      status?: PaymentStatus;
      createdBy?: any;
      transactionId?: string;
    },
  ) {
    const order = await this.orderModel.findOne({
      _id: orderId,
      isDeleted: false,
    });
    if (!order) throw new NotFoundException('Order not found');

    return this.paymentModel.findOneAndUpdate(
      { orderId, isDeleted: false },
      {
        $set: {
          amount: data.amount,
          method: data.method,
          status: data.status || PaymentStatus.PENDING,
          createdBy: data.createdBy,
          ...(data.transactionId ? { transactionId: data.transactionId } : {}),
        },
        $setOnInsert: { orderId, isDeleted: false },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  async syncPendingPaymentForOrder(
    orderId: string,
    data: {
      method: PaymentMethod;
      amount: number;
      createdBy?: { _id: string; email: string } | null;
    },
  ): Promise<PaymentDocument> {
    const paidPayment = await this.paymentModel.findOne({
      orderId,
      status: PaymentStatus.PAID,
      isDeleted: false,
    });
    if (paidPayment) {
      throw new BadRequestException(
        'Không thể đổi phí hoặc phương thức sau khi đơn đã thanh toán',
      );
    }

    const payment = await this.paymentModel.findOneAndUpdate(
      { orderId, isDeleted: false },
      {
        $set: {
          method: data.method,
          amount: data.amount,
          status: PaymentStatus.PENDING,
          createdBy: data.createdBy ?? null,
          isDeleted: false,
          updatedAt: new Date(),
        },
        $unset: {
          vnpData: 1,
          extraData: 1,
          transactionId: 1,
          attempts: 1,
          expiresAt: 1,
          paidAt: 1,
          failureCode: 1,
          failureMessage: 1,
          lastGatewayCheckAt: 1,
        },
        $setOnInsert: { orderId, isDeleted: false },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        sort: { createdAt: -1 },
      },
    );
    await this.paymentModel.updateMany(
      {
        orderId,
        _id: { $ne: payment._id },
        status: { $ne: PaymentStatus.PAID },
        isDeleted: false,
      },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );
    return payment;
  }

  async updatePaymentStatusByTransaction(
    transactionId: string,
    status: PaymentStatus,
    metadata: {
      responseCode?: string;
      responseMessage?: string;
      providerTransactionId?: string;
      callbackReceivedAt?: Date;
      lastCheckedAt?: Date;
    } = {},
  ) {
    const payment = await this.findByTransactionId(transactionId);
    if (!payment) return null;

    const attempt = payment.attempts?.find(
      (item) => item.transactionId === transactionId,
    );
    if (attempt) {
      attempt.status = status;
      if (metadata.responseCode !== undefined) {
        attempt.responseCode = metadata.responseCode;
      }
      if (metadata.responseMessage !== undefined) {
        attempt.responseMessage = metadata.responseMessage;
      }
      if (metadata.providerTransactionId !== undefined) {
        attempt.providerTransactionId = metadata.providerTransactionId;
      }
      attempt.callbackReceivedAt = metadata.callbackReceivedAt ?? new Date();
      if (metadata.lastCheckedAt) attempt.lastCheckedAt = metadata.lastCheckedAt;
    }

    if (
      payment.status === PaymentStatus.PAID &&
      status === PaymentStatus.FAILED
    ) {
      if (attempt) await payment.save();
      return payment;
    }

    // A late failure from an older attempt must never invalidate a newer
    // attempt that the customer is still completing.
    if (
      status === PaymentStatus.FAILED &&
      payment.transactionId !== transactionId
    ) {
      if (attempt) await payment.save();
      return payment;
    }

    if (status === PaymentStatus.PAID) {
      payment.paidAt = payment.paidAt ?? new Date();
      payment.failureCode = undefined;
      payment.failureMessage = undefined;
    } else if (status === PaymentStatus.FAILED) {
      payment.failureCode = metadata.responseCode;
      payment.failureMessage = metadata.responseMessage;
    }
    return this.transitionPayment(payment, status);
  }

  async findByTransactionId(
    transactionId: string,
  ): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({
      isDeleted: false,
      $or: [
        { transactionId },
        { 'attempts.transactionId': transactionId },
      ],
    });
  }

  async getRecoveryStatus(transactionId: string): Promise<PaymentDocument | null> {
    const payment = await this.findByTransactionId(transactionId);
    if (!payment) return null;
    if (
      payment.status === PaymentStatus.PENDING &&
      payment.transactionId === transactionId &&
      payment.expiresAt &&
      payment.expiresAt.getTime() <= Date.now()
    ) {
      return this.updatePaymentStatusByTransaction(
        transactionId,
        PaymentStatus.FAILED,
        {
          responseCode: 'EXPIRED',
          responseMessage: 'Payment attempt expired before confirmation',
        },
      );
    }
    return payment;
  }

  async recordGatewayCheck(
    transactionId: string,
    metadata: {
      responseCode?: string;
      responseMessage?: string;
      providerTransactionId?: string;
    },
  ): Promise<PaymentDocument | null> {
    const payment = await this.findByTransactionId(transactionId);
    if (!payment) return null;
    const checkedAt = new Date();
    payment.lastGatewayCheckAt = checkedAt;
    const attempt = payment.attempts?.find(
      (item) => item.transactionId === transactionId,
    );
    if (attempt) {
      attempt.lastCheckedAt = checkedAt;
      if (metadata.responseCode !== undefined) {
        attempt.responseCode = metadata.responseCode;
      }
      if (metadata.responseMessage !== undefined) {
        attempt.responseMessage = metadata.responseMessage;
      }
      if (metadata.providerTransactionId !== undefined) {
        attempt.providerTransactionId = metadata.providerTransactionId;
      }
    }
    await payment.save();
    return payment;
  }

  async markManualPaymentPaid(orderId: string): Promise<PaymentDocument> {
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        orderId,
        method: { $in: MANUAL_PAYMENT_METHODS },
        status: { $ne: PaymentStatus.PAID },
        isDeleted: false,
      },
      { status: PaymentStatus.PAID, updatedAt: new Date() },
      { new: true },
    );
    if (!payment) {
      const existing = await this.paymentModel.findOne({
        orderId,
        method: { $in: MANUAL_PAYMENT_METHODS },
        isDeleted: false,
      });
      if (existing?.status === PaymentStatus.PAID) return existing;
      throw new BadRequestException('Không tìm thấy giao dịch thủ công hợp lệ');
    }
    return payment;
  }

  async prepareGatewayPayment(
    orderId: string,
    method: PaymentMethod.MOMO,
    amount: number,
    transactionId: string,
    metadata: {
      requestId?: string;
      expiresAt?: Date;
      gatewayCreatedAt?: string;
    } = {},
  ): Promise<PaymentDocument> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be a positive integer',
      );
    }

    const paid = await this.paymentModel.findOne({
      orderId,
      status: PaymentStatus.PAID,
      isDeleted: false,
    });
    if (paid) throw new BadRequestException('Order has already been paid');

    const now = new Date();
    const expiresAt = metadata.expiresAt ?? new Date(now.getTime() + 15 * 60_000);
    let payment = await this.paymentModel.findOne({ orderId, isDeleted: false });

    if (!payment) {
      payment = await this.paymentModel.create({
        orderId,
        amount,
        method,
        transactionId,
        status: PaymentStatus.PENDING,
        attempts: [],
        attemptCount: 0,
        isDeleted: false,
      });
    }
    if (
      payment.status === PaymentStatus.PAID ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException('Order has already been paid');
    }

    payment.attempts = payment.attempts ?? [];
    if (
      payment.transactionId &&
      payment.transactionId !== transactionId &&
      !payment.attempts.some(
        (attempt) => attempt.transactionId === payment.transactionId,
      )
    ) {
      payment.attempts.push({
        transactionId: payment.transactionId,
        status: payment.status,
        createdAt: payment.createdAt ?? now,
        expiresAt: payment.expiresAt,
      });
    }
    if (
      !payment.attempts.some(
        (attempt) => attempt.transactionId === transactionId,
      )
    ) {
      payment.attempts.push({
        transactionId,
        requestId: metadata.requestId,
        status: PaymentStatus.PENDING,
        createdAt: now,
        expiresAt,
        gatewayCreatedAt: metadata.gatewayCreatedAt,
      });
    }

    payment.amount = amount;
    payment.method = method;
    payment.transactionId = transactionId;
    payment.status = PaymentStatus.PENDING;
    payment.expiresAt = expiresAt;
    payment.attemptCount = payment.attempts.length;
    payment.failureCode = undefined;
    payment.failureMessage = undefined;
    await payment.save();
    return payment;
  }

  @Cron('0 * * * * *')
  async expireStaleGatewayPayments(): Promise<void> {
    await this.paymentModel.updateMany(
      {
        status: PaymentStatus.PENDING,
        method: { $in: [PaymentMethod.MOMO] },
        expiresAt: { $lte: new Date() },
        isDeleted: false,
      },
      {
        $set: {
          status: PaymentStatus.FAILED,
          failureCode: 'EXPIRED',
          failureMessage: 'Payment attempt expired before confirmation',
          updatedAt: new Date(),
        },
      },
    );
  }

  async hasSuccessfulPayment(orderId: string): Promise<boolean> {
    return Boolean(
      await this.paymentModel.exists({
        orderId,
        status: PaymentStatus.PAID,
        isDeleted: false,
      }),
    );
  }

  async findByOrderId(orderId: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({ orderId, isDeleted: false });
  }

  private async transitionPayment(
    payment: PaymentDocument,
    nextStatus: PaymentStatus,
  ): Promise<PaymentDocument> {
    const currentStatus = payment.status;
    if (currentStatus === nextStatus) {
      if (nextStatus === PaymentStatus.PAID) {
        await this.confirmOrderWhenPaid(payment);
      }
      return payment;
    }

    const transitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.PENDING]: [PaymentStatus.PAID, PaymentStatus.FAILED],
      [PaymentStatus.FAILED]: [PaymentStatus.PENDING, PaymentStatus.PAID],
      [PaymentStatus.PAID]: [PaymentStatus.REFUNDED],
      [PaymentStatus.REFUNDED]: [],
    };
    if (!transitions[currentStatus]?.includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot change payment from ${currentStatus} to ${nextStatus}`,
      );
    }

    payment.status = nextStatus;
    payment.updatedAt = new Date();
    await payment.save();
    if (nextStatus === PaymentStatus.PAID) {
      await this.confirmOrderWhenPaid(payment);
    }
    return payment;
  }

  private async confirmOrderWhenPaid(payment: PaymentDocument): Promise<void> {
    const order = await this.orderModel.findOne({
      _id: payment.orderId,
      isDeleted: false,
    });
    if (!order || order.status !== OrderStatus.PENDING) return;
    await this.ordersService.updateStatus(
      order._id.toString(),
      OrderStatus.CONFIRMED,
    );
  }
}
