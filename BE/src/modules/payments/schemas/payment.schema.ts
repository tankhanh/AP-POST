import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { PaymentMethod } from '../payment.constants';

export type PaymentDocument = HydratedDocument<Payment>;

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Schema({ _id: false })
export class PaymentAttempt {
  @Prop({ required: true, trim: true })
  transactionId: string;

  @Prop({ trim: true })
  requestId?: string;

  @Prop({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;

  @Prop()
  expiresAt?: Date;

  @Prop()
  gatewayCreatedAt?: string;

  @Prop()
  responseCode?: string;

  @Prop()
  responseMessage?: string;

  @Prop()
  providerTransactionId?: string;

  @Prop()
  callbackReceivedAt?: Date;

  @Prop()
  lastCheckedAt?: Date;
}

export const PaymentAttemptSchema =
  SchemaFactory.createForClass(PaymentAttempt);

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true })
  orderId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({
    required: true,
    enum: PaymentMethod,
  })
  method: PaymentMethod;

  @Prop({
    default: PaymentStatus.PENDING,
    enum: PaymentStatus,
  })
  status: PaymentStatus;

  @Prop({ unique: true, sparse: true })
  transactionId?: string;

  @Prop({ type: [PaymentAttemptSchema], default: [] })
  attempts: PaymentAttempt[];

  @Prop({ default: 0, min: 0 })
  attemptCount: number;

  @Prop()
  expiresAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop()
  failureCode?: string;

  @Prop()
  failureMessage?: string;

  @Prop()
  lastGatewayCheckAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object })
  createdBy?: { _id: mongoose.Types.ObjectId; email: string };

  @Prop({ type: Object })
  extraData?: Record<string, any>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ orderId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ 'attempts.transactionId': 1 }, { sparse: true });
PaymentSchema.index({ status: 1, expiresAt: 1 });
