/**
 * Payment-related types and interfaces for AP-POST
 */

export type PaymentMethod = 'CASH' | 'COD' | 'QR' | 'VNPAY' | 'BANK_TRANSFER' | 'MOMO';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'COMPLETED' | 'CANCELED';
export type ShippingFeePayer = 'SENDER' | 'RECEIVER';
export type VNPayReturnStatus = 'success' | 'failed' | 'error' | 'loading';

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
  vnpData?: VNPayData;
  extraData?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * VNPAY Data Interface
 */
export interface VNPayData {
  vnp_Amount?: number;
  vnp_BankCode?: string;
  vnp_BankTranNo?: string;
  vnp_CardType?: string;
  vnp_OrderInfo?: string;
  vnp_PayDate?: string;
  vnp_ResponseCode?: string;
  vnp_TmnCode?: string;
  vnp_TransactionNo?: string;
  vnp_TxnRef?: string;
}

/**
 * VNPAY Create Payment Response
 */
export interface VNPayCreatePaymentResponse {
  success: boolean;
  message?: string;
  data?: {
    paymentUrl: string;
    transactionCode: string;
    amount: number;
    orderId: string;
  };
}

/**
 * VNPAY Return Response
 */
export interface VNPayReturnResponse {
  success: boolean;
  status: VNPayReturnStatus;
  transactionCode?: string;
  amount?: number;
  responseCode?: string;
  orderId?: string;
  message?: string;
  paymentDetails?: Payment & { order?: Order };
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
  qrUrl?: string;
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
