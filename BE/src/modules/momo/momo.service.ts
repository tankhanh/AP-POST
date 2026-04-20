import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class MomoService {
  private readonly partnerCode: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly endpoint: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.partnerCode = this.configService.get<string>('MOMO_PARTNER_CODE')!;
    this.accessKey = this.configService.get<string>('MOMO_ACCESS_KEY')!;
    this.secretKey = this.configService.get<string>('MOMO_SECRET_KEY')!;
    this.endpoint =
      this.configService.get<string>('MOMO_ENDPOINT') ||
      'https://test-payment.momo.vn/v2/gateway/api/create';
  }

  async createPayment(
    orderId: string,
    amount: number,
    orderInfo: string,
  ): Promise<{ payUrl: string }> {
    const requestId = Date.now().toString();
    const redirectUrl = 'https://ap-post.vercel.app/payment/success';
    const ipnUrl = `${
      this.configService.get('API_BASE_URL') ||
      'https://ap-post-api.onrender.com'
    }/api/payments/momo/ipn`;
    const extraData = '';
    const requestType = 'payWithMethod';

    const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${this.partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(rawSignature)
      .digest('hex');

    const body = {
      partnerCode: this.partnerCode,
      partnerName: 'AP Post',
      storeId: 'APPostStore',
      requestId,
      amount: amount.toString(),
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData,
      requestType,
      signature,
      lang: 'vi',
    };

    const res = await firstValueFrom(
      this.httpService.post(this.endpoint, body),
    );
    const data = res.data;

    if (data.resultCode !== 0) {
      throw new BadRequestException(`Momo error: ${data.message}`);
    }

    return { payUrl: data.payUrl };
  }

  verifySignature(params: any, receivedSignature: string): boolean {
    const sortedKeys = Object.keys(params)
      .filter((key) => key !== 'signature')
      .sort();
    const raw = sortedKeys.map((key) => `${key}=${params[key]}`).join('&');

    const computed = crypto
      .createHmac('sha256', this.secretKey)
      .update(raw)
      .digest('hex');

    return computed === receivedSignature;
  }
}
