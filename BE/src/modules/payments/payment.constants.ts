export enum PaymentMethod {
  CASH = 'CASH',
  COD = 'COD',
  MOMO = 'MOMO',
}

export const ORDER_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.COD,
  PaymentMethod.MOMO,
] as const;

export const STORED_ORDER_PAYMENT_METHODS = [...ORDER_PAYMENT_METHODS] as const;

export const MANUAL_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.COD,
] as const;

export const ONLINE_PAYMENT_METHODS = [PaymentMethod.MOMO] as const;
