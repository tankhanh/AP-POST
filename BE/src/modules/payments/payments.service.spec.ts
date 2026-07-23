import { OrderStatus } from '../orders/schemas/order.schemas';
import { PaymentMethod } from './payment.constants';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './schemas/payment.schema';

describe('PaymentsService state machine', () => {
  const orderId = { toString: () => 'order-1' };
  const createPayment = (
    status: PaymentStatus,
    method: PaymentMethod = PaymentMethod.MOMO,
  ) => {
    const payment: any = {
      orderId,
      transactionId: 'transaction-1',
      attempts: [],
      status,
      method,
      save: jest.fn(),
    };
    payment.save.mockImplementation(async () => payment);
    return payment;
  };

  const setup = (payment: any, orderStatus = OrderStatus.PENDING) => {
    const paymentModel = {
      findOne: jest.fn().mockResolvedValue(payment),
    };
    const orderModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: orderId,
        status: orderStatus,
      }),
    };
    const ordersService = { updateStatus: jest.fn().mockResolvedValue({}) };
    const service = new PaymentsService(
      paymentModel as never,
      orderModel as never,
      ordersService as never,
    );
    return { service, paymentModel, orderModel, ordersService };
  };

  it('confirms a pending order only after payment becomes paid', async () => {
    const payment = createPayment(PaymentStatus.PENDING);
    const { service, ordersService } = setup(payment);

    await service.updatePaymentStatusByTransaction(
      'transaction-1',
      PaymentStatus.PAID,
    );

    expect(payment.status).toBe(PaymentStatus.PAID);
    expect(payment.save).toHaveBeenCalledTimes(1);
    expect(ordersService.updateStatus).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.CONFIRMED,
    );
  });

  it('keeps the order pending when a payment fails', async () => {
    const payment = createPayment(PaymentStatus.PENDING);
    const { service, orderModel, ordersService } = setup(payment);

    await service.updatePaymentStatusByTransaction(
      'transaction-1',
      PaymentStatus.FAILED,
    );

    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(orderModel.findOne).not.toHaveBeenCalled();
    expect(ordersService.updateStatus).not.toHaveBeenCalled();
  });

  it('never downgrades a paid payment to failed', async () => {
    const payment = createPayment(PaymentStatus.PAID);
    const { service } = setup(payment);

    await expect(
      service.updatePaymentStatusByTransaction(
        'transaction-1',
        PaymentStatus.FAILED,
      ),
    ).resolves.toBe(payment);
    expect(payment.status).toBe(PaymentStatus.PAID);
    expect(payment.save).not.toHaveBeenCalled();
  });

  it('rejects direct status updates for an online payment', async () => {
    const payment = createPayment(PaymentStatus.PENDING, PaymentMethod.MOMO);
    const { service, ordersService } = setup(payment);

    await expect(
      service.updateStatus('payment-1', PaymentStatus.PAID),
    ).rejects.toThrow(
      'Online payments can only be updated by a verified gateway callback',
    );
    expect(payment.save).not.toHaveBeenCalled();
    expect(ordersService.updateStatus).not.toHaveBeenCalled();
  });

  it('does not allow a manual payment method to confirm an online order', async () => {
    const paymentModel = { findOne: jest.fn() };
    const orderModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: orderId,
        paymentMethod: PaymentMethod.MOMO,
      }),
    };
    const service = new PaymentsService(
      paymentModel as never,
      orderModel as never,
      {} as never,
    );

    await expect(service.create('order-1', PaymentMethod.CASH)).rejects.toThrow(
      'Payment method does not match the order',
    );
  });
});
