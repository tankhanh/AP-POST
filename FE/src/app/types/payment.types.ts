/**
 * Payment-related types and interfaces for AP-POST
 */

export type PaymentMethod = 'CASH' | 'COD' | 'MOMO';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';
export type ShippingFeePayer = 'SENDER' | 'RECEIVER';

/**
 * Order Address Interface
 */
export interface OrderAddress {
  provinceId: string;
  communeId: string;
  address: string;
  lat?: number;
  lng?: number;
}

/**
 * Order Interface
 */
export interface Order {
  _id?: string;
  waybill?: string;
  senderName: string;
  senderPhone?: string;
  receiverName: string;
  receiverPhone: string;
  email?: string;
  pickupAddress: OrderAddress;
  deliveryAddress: OrderAddress;
  codValue?: number;
  weightKg: number;
  serviceCode?: string;
  details?: string;
  shippingFeePayer?: ShippingFeePayer;
  shippingFee?: number;
  paymentMethod?: PaymentMethod;
  status?: OrderStatus;
  totalPrice?: number;
  totalOrderValue?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Payment Interface
 */
export interface Payment {
  _id?: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  extraData?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Payment Details Response
 */
export interface PaymentDetailsResponse {
  success: boolean;
  data?: Payment & {
    orderId: string;
    order?: Order;
  };
}

/**
 * Order Create Response
 */
export interface OrderCreateResponse {
  success: boolean;
  message?: string;
  data?: {
    order: Order;
    payment?: Payment;
  };
}

/**
 * Payment API Response
 */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
