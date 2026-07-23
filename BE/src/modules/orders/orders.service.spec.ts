import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { DeliveryState, OrderStatus } from './schemas/order.schemas';

describe('OrdersService payment status guard', () => {
  const createService = (order: Record<string, any>, paymentPaid = true) => {
    const orderModel = { findById: jest.fn().mockResolvedValue(order) };
    const paymentsService = {
      hasSuccessfulPayment: jest.fn().mockResolvedValue(paymentPaid),
    };
    const connection = { model: jest.fn().mockReturnValue({}) };
    const service = new OrdersService(
      orderModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      connection as never,
      {} as never,
      paymentsService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, paymentsService };
  };

  it('keeps an unpaid order pending when a direct confirmation is requested', async () => {
    const order = {
      _id: { toString: () => 'order-1' },
      isDeleted: false,
      status: OrderStatus.PENDING,
      save: jest.fn(),
    };
    const orderModel = { findById: jest.fn().mockResolvedValue(order) };
    const paymentsService = {
      hasSuccessfulPayment: jest.fn().mockResolvedValue(false),
    };
    const connection = { model: jest.fn().mockReturnValue({}) };
    const service = new OrdersService(
      orderModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      connection as never,
      {} as never,
      paymentsService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateStatus('order-1', OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.save).not.toHaveBeenCalled();
    expect(paymentsService.hasSuccessfulPayment).toHaveBeenCalledWith(
      'order-1',
    );
  });

  it('does not let an operator bypass the shipper flow to mark an order shipping', async () => {
    const order = {
      _id: { toString: () => 'order-2' },
      isDeleted: false,
      status: OrderStatus.CONFIRMED,
      deliveryState: DeliveryState.UNASSIGNED,
      save: jest.fn(),
    };
    const { service } = createService(order);

    await expect(
      service.updateStatus('order-2', OrderStatus.SHIPPING),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(order.save).not.toHaveBeenCalled();
  });

  it('does not cancel an order while a shipper is delivering it', async () => {
    const order = {
      _id: { toString: () => 'order-3' },
      isDeleted: false,
      status: OrderStatus.SHIPPING,
      deliveryState: DeliveryState.DELIVERING,
      save: jest.fn(),
    };
    const { service } = createService(order);

    await expect(
      service.updateStatus('order-3', OrderStatus.CANCELED),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(order.save).not.toHaveBeenCalled();
  });
});
