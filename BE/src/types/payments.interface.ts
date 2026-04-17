import mongoose from 'mongoose';

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
}

export interface IPayment {
  _id?: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  amount: number;
  method: 'COD' | 'FAKE' | 'BANK_TRANSFER' | 'CASH' | 'MOMO' | 'VNPAY' | 'CARD' | 'QR';
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  transactionId?: string;
  vnpData?: IVNPayData;
  extraData?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  createdBy?: { _id: mongoose.Types.ObjectId; email: string };
  updatedBy?: { _id: mongoose.Types.ObjectId; email: string };
  deletedBy?: { _id: mongoose.Types.ObjectId; email: string };
}

export interface IPaymentResponse {
  success: boolean;
  message?: string;
  data?: IPayment | any;
}

export interface IVNPayResponse {
  success: boolean;
  message?: string;
  transactionCode?: string;
  amount?: number;
  responseCode?: string;
  orderId?: string;
  paymentUrl?: string;
}
