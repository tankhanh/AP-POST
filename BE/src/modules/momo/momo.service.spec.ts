import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MomoService } from './momo.service';

describe('MomoService callback verification', () => {
  const secretKey = 'test-momo-secret';
  const values: Record<string, string> = {
    MOMO_PARTNER_CODE: 'MOMO',
    MOMO_ACCESS_KEY: 'access-key',
    MOMO_SECRET_KEY: secretKey,
  };
  const config = {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as ConfigService;
  const service = new MomoService(config, {} as never);
  const callback = {
    amount: 150000,
    extraData: '',
    message: 'Successful.',
    orderId: 'ORDER-123',
    orderInfo: 'AP Post order',
    orderType: 'momo_wallet',
    partnerCode: 'MOMO',
    payType: 'qr',
    requestId: 'REQUEST-123',
    responseTime: 1_700_000_000_000,
    resultCode: 0,
    transId: 987654321,
  };

  const rawSignature =
    'accessKey=access-key&amount=150000&extraData=&message=Successful.' +
    '&orderId=ORDER-123&orderInfo=AP Post order&orderType=momo_wallet' +
    '&partnerCode=MOMO&payType=qr&requestId=REQUEST-123' +
    '&responseTime=1700000000000&resultCode=0&transId=987654321';
  const signature = createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');

  it('accepts a valid gateway signature', () => {
    expect(service.verifyCallbackSignature(callback, signature)).toBe(true);
  });

  it('rejects a tampered callback and malformed signatures', () => {
    expect(
      service.verifyCallbackSignature(
        { ...callback, amount: 150001 },
        signature,
      ),
    ).toBe(false);
    expect(service.verifyCallbackSignature(callback, 'not-hex')).toBe(false);
  });
});
