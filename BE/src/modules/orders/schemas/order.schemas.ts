import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import {
  PaymentMethod,
  STORED_ORDER_PAYMENT_METHODS,
} from '../../payments/payment.constants';

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

export enum DeliveryState {
  UNASSIGNED = 'UNASSIGNED',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',
  DELIVERING = 'DELIVERING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export enum AssignmentMode {
  MANUAL = 'MANUAL',
  AUTO = 'AUTO',
}

export enum BranchAssignmentSource {
  STAFF_PROFILE = 'STAFF_PROFILE',
  ADDRESS = 'ADDRESS',
  SINGLE_ACTIVE_BRANCH = 'SINGLE_ACTIVE_BRANCH',
  MANUAL_SHIPPER_BRANCH = 'MANUAL_SHIPPER_BRANCH',
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ trim: true })
  clientRequestId?: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
  })
  userId?: Types.ObjectId | null;

  @Prop({ required: true })
  snapshotPricingId: Types.ObjectId;

  @Prop({ required: true }) senderName: string;
  @Prop({ required: true }) receiverName: string;
  @Prop({ required: true }) receiverPhone: string;
  @Prop() senderPhone?: string;
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

  @Prop({ type: String, enum: BranchAssignmentSource })
  branchAssignmentSource?: BranchAssignmentSource;

  @Prop()
  branchAssignedAt?: Date;

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
    enum: STORED_ORDER_PAYMENT_METHODS,
    default: PaymentMethod.CASH,
  })
  paymentMethod?: PaymentMethod;

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

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  assignedShipperId?: Types.ObjectId | null;

  @Prop({ type: String, enum: AssignmentMode, default: AssignmentMode.MANUAL })
  assignmentMode: AssignmentMode;

  @Prop({
    type: String,
    enum: DeliveryState,
    default: DeliveryState.UNASSIGNED,
  })
  deliveryState: DeliveryState;

  @Prop()
  assignedAt?: Date;

  @Prop()
  assignmentExpiresAt?: Date;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  assignmentRejectedAt?: Date;

  @Prop()
  assignmentRejectionReason?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  lastRejectedShipperId?: Types.ObjectId;

  @Prop({ type: [Object], default: [] })
  assignmentHistory?: Array<{
    shipperId: Types.ObjectId;
    action: 'ASSIGNED' | 'ACCEPTED' | 'REJECTED' | 'UNASSIGNED' | 'EXPIRED';
    mode?: AssignmentMode;
    at: Date;
    reason?: string;
    actorId?: Types.ObjectId;
  }>;

  @Prop()
  deliveryStartedAt?: Date;

  @Prop({ default: 0, min: 0 })
  deliveryAttempts: number;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  deliveryFailedAt?: Date;

  @Prop()
  recipientConfirmedName?: string;

  @Prop()
  proofOfDeliveryUrl?: string;

  @Prop()
  deliveryNote?: string;

  @Prop()
  deliveryFailureReason?: string;

  @Prop({ type: Object })
  lastDeliveryLocation?: { lat: number; lng: number; updatedAt: Date };
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ channel: 1, userId: 1, createdAt: -1 });
OrderSchema.index({ senderPhone: 1, channel: 1 });
OrderSchema.index({ branchId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ assignedShipperId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ assignedShipperId: 1, deliveryState: 1, assignedAt: -1 });
OrderSchema.index({ deliveryState: 1, assignmentExpiresAt: 1 });
OrderSchema.index({ branchId: 1, deliveryState: 1, createdAt: -1 });
OrderSchema.index({ assignmentMode: 1, deliveryState: 1, createdAt: 1 });
OrderSchema.index({ clientRequestId: 1 }, { unique: true, sparse: true });
