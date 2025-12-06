import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true })
  orderId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({
    required: true,
    enum: ['COD', 'MOMO', 'VNPAY', 'BANK_TRANSFER', 'CASH'],
  })
  method: string;

  @Prop({
    default: PaymentStatus.PENDING,
    enum: PaymentStatus,
  })
  status: PaymentStatus;

  @Prop({ unique: true, sparse: true })
  transactionId?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object })
  createdBy?: { _id: mongoose.Types.ObjectId; email: string };
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Index để tìm theo transactionId nhanh
PaymentSchema.index({ transactionId: 1 });
