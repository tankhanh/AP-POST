import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
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

export enum OrderChannel {
  B2B_STAFF = 'B2B_STAFF',
  B2C_GUEST = 'B2C_GUEST',
  B2C_USER = 'B2C_USER',
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null })
  userId?: Types.ObjectId | null;

  @Prop({ required: true })
  snapshotPricingId: Types.ObjectId;

  @Prop({ required: true }) senderName: string;
  @Prop({ required: true }) receiverName: string;
  @Prop({ required: true }) receiverPhone: string;
  @Prop() senderPhone?: string;
  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true })
  pickupAddressId: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true })
  deliveryAddressId: Types.ObjectId;

  @Prop({ required: true, min: 0 }) totalPrice: number;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

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

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: false })
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

  @Prop({ type: Object })
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
  senderPayAmount: number;

  @Prop({ required: false, min: 0 })
  receiverPayAmount: number;

  @Prop({ required: false, min: 0 })
  totalOrderValue: number;

  @Prop({
    type: String,
    enum: ['CASH', 'COD', 'MOMO'],   // ← ĐÃ RÚT GỌN
    default: 'CASH',
  })
  paymentMethod?: string;

  @Prop({
    type: String,
    enum: OrderChannel,
    default: OrderChannel.B2B_STAFF,
  })
  channel: OrderChannel;

  @Prop({
    type: String,
    enum: ['DROPOFF', 'PICKUP'],
    default: 'DROPOFF',
  })
  pickupMethod?: 'DROPOFF' | 'PICKUP';

  @Prop()
  pickupSlot?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ waybill: 1 });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ channel: 1, userId: 1, createdAt: -1 });
OrderSchema.index({ senderPhone: 1, channel: 1 });
OrderSchema.plugin(softDeletePlugin);