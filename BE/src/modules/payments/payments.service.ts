import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schemas';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async create(orderId: string, method: string) {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    let amount: number;
    if (method === 'CASH') {
      amount = order.senderPayAmount;
    } else if (method === 'COD') {
      amount = order.receiverPayAmount;
    } else {
      amount = order.totalOrderValue; // fallback
    }

    const payment = new this.paymentModel({
      orderId: order._id,
      amount,
      method,
      status: 'paid', // Giả sử paid ngay khi tạo (có thể thay đổi nếu cần pending)
    });
    return payment.save();
  }

  async findAll() {
    return this.paymentModel.find().populate('orderId').exec();
  }

  async findOne(id: string) {
    const payment = await this.paymentModel.findById(id).populate('orderId');
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async updateStatus(id: string, status: string) {
    const payment = await this.paymentModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async createPaymentForOrder(
    orderId: string,
    data: {
      method: string;
      amount: number;
      status?: string;
      createdBy?: any;
      transactionId?: string;
    },
  ) {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    const payment = await this.paymentModel.create({
      orderId,
      amount: data.amount,
      method: data.method,
      status: data.status || 'pending',
      transactionId: data.transactionId,
      createdBy: data.createdBy,
    });

    return payment;
  }

  // Thêm hàm này vào class PaymentsService
  async updatePaymentStatusByTransaction(
    transactionId: string,
    status: string,
  ) {
    const payment = await this.paymentModel.findOneAndUpdate(
      { transactionId },
      { status, updatedAt: new Date() },
      { new: true },
    );

    if (payment && status === 'paid') {
      // Tự động xác nhận đơn hàng nếu cần
      await this.orderModel.updateOne(
        { _id: payment.orderId },
        { status: 'CONFIRMED' },
      );
    }

    return payment;
  }

  // src/modules/payments/payments.service.ts
  async updatePaymentStatus(
    txnRef: string,
    status: 'success' | 'failed',
    vnpData?: any,
  ) {
    console.log('Cập nhật theo doc IPN:', { txnRef, status, vnpData });

    // Tìm payment/order theo txnRef
    const payment = await this.paymentModel.findOneAndUpdate(
      { transactionId: txnRef }, // Theo doc: dùng vnp_TxnRef
      {
        status,
        updatedAt: new Date(),
        vnpData: vnpData || {}, // Lưu full data theo doc
      },
      { new: true },
    );

    if (!payment) throw new BadRequestException('Payment not found');

    if (status === 'success') {
      // Update order status theo doc
      await this.orderModel.updateOne(
        { waybill: txnRef },
        { status: 'CONFIRMED' },
      );
    }

    return payment;
  }
}
