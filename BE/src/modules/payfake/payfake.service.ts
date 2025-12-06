// src/modules/payfake/payfake.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class PayfakeService {
  private readonly PAYFAKE_BASE = 'https://payfake-appost.onrender.com';

  buildPaymentUrl(
    orderId: string,
    waybill: string,
    amount: number,
    returnUrl: string,
  ): string {
    const params = new URLSearchParams({
      amount: amount.toString(),
      orderId: waybill || orderId,
      currency: 'VND',
      returnUrl: returnUrl,
      cancelUrl: returnUrl + '?status=cancel',
    });

    return `${this.PAYFAKE_BASE}/pay?${params.toString()}`;
  }
}