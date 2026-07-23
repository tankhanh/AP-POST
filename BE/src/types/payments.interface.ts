import mongoose from 'mongoose';
import { PaymentMethod } from 'src/modules/payments/payment.constants';

export interface IPayment {
  _id?: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  transactionId?: string;
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
