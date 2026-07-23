import { DeliveryState } from './schemas/order.schemas';

export const DELIVERY_STATE_TRANSITIONS: Readonly<
  Record<DeliveryState, readonly DeliveryState[]>
> = {
  [DeliveryState.UNASSIGNED]: [DeliveryState.ASSIGNED],
  [DeliveryState.ASSIGNED]: [DeliveryState.UNASSIGNED, DeliveryState.ACCEPTED],
  [DeliveryState.ACCEPTED]: [
    DeliveryState.UNASSIGNED,
    DeliveryState.DELIVERING,
  ],
  [DeliveryState.DELIVERING]: [DeliveryState.DELIVERED, DeliveryState.FAILED],
  [DeliveryState.FAILED]: [
    DeliveryState.UNASSIGNED,
    DeliveryState.ASSIGNED,
    DeliveryState.DELIVERING,
  ],
  [DeliveryState.DELIVERED]: [],
};

export function canTransitionDeliveryState(
  from: DeliveryState,
  to: DeliveryState,
): boolean {
  return DELIVERY_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ACTIVE_DELIVERY_STATES: readonly DeliveryState[] = [
  DeliveryState.ASSIGNED,
  DeliveryState.ACCEPTED,
  DeliveryState.DELIVERING,
  DeliveryState.FAILED,
];
