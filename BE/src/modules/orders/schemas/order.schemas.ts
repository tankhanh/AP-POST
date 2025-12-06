import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsOptional } from 'class-validator';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { softDeletePlugin } from 'soft-delete-plugin-mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPING = 'SHIPPING',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
}

export enum ShippingFeePayer {
  SENDER = 'SENDER',
  RECEIVER = 'RECEIVER',
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  snapshotPricingId: Types.ObjectId;

  @Prop({ required: true }) senderName: string;

  @Prop({ required: true }) receiverName: string;

  @Prop({ required: true }) receiverPhone: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',
    required: true,
  })
  pickupAddressId: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',
    required: true,
  })
  deliveryAddressId: Types.ObjectId;

  @Prop({ required: true, min: 0 }) totalPrice: number;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  // soft delete fields (plugin sẽ quản lý)
  @Prop({ default: false }) isDeleted: boolean;
  @Prop() deletedAt?: Date;
  @Prop({ type: Object }) deletedBy?: { _id: Types.ObjectId; email: string };

  @Prop({ required: true, min: 0 })
  codValue: number;

  @Prop({ type: String, default: null })
  details?: string;

  @Prop({ required: true, min: 0 })
  shippingFee: number;

  @Prop({ default: 'STD' })
  serviceCode: 'STD' | 'EXP';

  @Prop({ required: true, min: 0.01 })
  weightKg: number;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: false,
  })
  branchId: Types.ObjectId;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/,
  })
  waybill: string;

  @Prop({ default: Date.now })
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;

  @Prop({
    type: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      email: String,
    },
    required: false,
  })
  createdBy?: { _id: Types.ObjectId; email: string };

  @Prop({ type: Object })
  snapshotBreakdown?: any;

  @Prop({
    type: String,
    enum: ShippingFeePayer,
    default: ShippingFeePayer.SENDER,
  })
  shippingFeePayer: ShippingFeePayer;

  @Prop({ required: false, min: 0 })
  senderPayAmount: number; // Tiền người gửi trả tại quầy

  @Prop({ required: false, min: 0 })
  receiverPayAmount: number; // Tiền người nhận trả khi nhận

  @Prop({ required: false, min: 0 })
  totalOrderValue: number; // Tổng codValue + shippingFee

  @Prop({
    type: String,
    enum: ['CASH', 'COD', 'MOMO', 'VNPAY', 'BANK_TRANSFER', 'FAKE'],
    default: 'CASH',
  })
  paymentMethod?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ waybill: 1 });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, isDeleted: 1 });
OrderSchema.index({ branchId: 1, createdAt: -1 });
OrderSchema.index({ branchId: 1, status: 1 });
OrderSchema.plugin(softDeletePlugin);
