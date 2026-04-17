import { Types } from 'mongoose';

export interface IOrderItem {
  productId: Types.ObjectId;
  quantity: number;
  price: number;
}

export interface IOrderAddress {
  provinceId: string;
  communeId: string;
  address: string;
  lat?: number;
  lng?: number;
}

export interface IOrder {
  _id?: Types.ObjectId;
  user?: Types.ObjectId;
  waybill?: string;
  senderName: string;
  senderPhone?: string;
  receiverName: string;
  receiverPhone: string;
  email?: string;
  pickupAddress: IOrderAddress;
  deliveryAddress: IOrderAddress;
  codValue?: number;
  weightKg: number;
  serviceCode?: string;
  details?: string;
  shippingFeePayer?: 'SENDER' | 'RECEIVER';
  shippingFee?: number;
  paymentMethod?: 'CASH' | 'COD' | 'QR' | 'VNPAY' | 'BANK_TRANSFER' | 'MOMO';
  status?: 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';
  items?: IOrderItem[];
  totalPrice?: number;
  totalOrderValue?: number;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  createdBy?: { _id: Types.ObjectId; email: string };
  updatedBy?: { _id: Types.ObjectId; email: string };
  deletedBy?: { _id: Types.ObjectId; email: string };
}
