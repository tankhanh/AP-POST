import { DeliveryState } from './schemas/order.schemas';
import {
  ACTIVE_DELIVERY_STATES,
  canTransitionDeliveryState,
} from './delivery-state.machine';

describe('delivery state machine', () => {
  it.each([
    [DeliveryState.UNASSIGNED, DeliveryState.ASSIGNED],
    [DeliveryState.ASSIGNED, DeliveryState.ACCEPTED],
    [DeliveryState.ACCEPTED, DeliveryState.DELIVERING],
    [DeliveryState.DELIVERING, DeliveryState.DELIVERED],
    [DeliveryState.DELIVERING, DeliveryState.FAILED],
    [DeliveryState.FAILED, DeliveryState.DELIVERING],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransitionDeliveryState(from, to)).toBe(true);
  });

  it.each([
    [DeliveryState.UNASSIGNED, DeliveryState.DELIVERING],
    [DeliveryState.ASSIGNED, DeliveryState.DELIVERED],
    [DeliveryState.ACCEPTED, DeliveryState.DELIVERED],
    [DeliveryState.FAILED, DeliveryState.DELIVERED],
    [DeliveryState.DELIVERED, DeliveryState.DELIVERING],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransitionDeliveryState(from, to)).toBe(false);
  });

  it('treats failed jobs as active until dispatch resolves them', () => {
    expect(ACTIVE_DELIVERY_STATES).toContain(DeliveryState.FAILED);
    expect(ACTIVE_DELIVERY_STATES).not.toContain(DeliveryState.DELIVERED);
  });
});
