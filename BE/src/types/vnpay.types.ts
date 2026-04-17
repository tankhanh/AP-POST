import mongoose from 'mongoose';

/**
 * VNPAY Payment Gateway Specific Types
 */

export interface IVNPayConfig {
  vnpayUrl: string;
  tmnCode: string;
  hashSecret: string;
  orderInfo: string;
  orderType: string;
  locale: string;
  currency: string;
}

export interface IVNPayRequest {
  vnp_Version: string;
  vnp_Command: string;
  vnp_TmnCode: string;
  vnp_Locale: string;
  vnp_CurrCode: string;
  vnp_TxnRef: string;
  vnp_OrderInfo: string;
  vnp_OrderType: string;
  vnp_Amount: string;
  vnp_ReturnUrl: string;
  vnp_IpAddr: string;
  vnp_CreateDate: string;
  [key: string]: string;
}

export interface IVNPayResponse {
  success: boolean;
  message: string;
  transactionCode?: string;
  amount?: number;
  responseCode?: string;
  orderId?: string;
}

export interface IVNPayData {
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
  [key: string]: any;
}

export interface IVNPayCreatePaymentResponse {
  success: boolean;
  message: string;
  data?: {
    paymentUrl: string;
    transactionCode: string;
    amount: number;
    orderId: string;
  };
}

export interface IVNPayVerifyResponse {
  success: boolean;
  orderId?: string;
  transactionCode?: string;
  amount?: number;
  message?: string;
  responseCode?: string;
}

export interface IVNPayIpnVerifyResponse {
  RspCode: string;
  Message: string;
}

export type MongooseId = mongoose.Types.ObjectId | string;

export default {};
