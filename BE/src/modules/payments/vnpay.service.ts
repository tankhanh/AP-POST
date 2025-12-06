// src/modules/payments/vnpay.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class VnpayService {
  constructor(private configService: ConfigService) {}

  private formatDate(date: Date): string {
    return date.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  }

  // Theo doc: Build hashData với encodeURIComponent cho tất cả key=value
  buildHashData(params: Record<string, string>): string {
    const sortedParams = this.sortObject(params);
    let hashData = '';
    let i = 0;
    for (const key in sortedParams) {
      const urlKey = encodeURIComponent(key);
      const urlValue = encodeURIComponent(sortedParams[key]);
      if (i === 1) {
        hashData += '&' + urlKey + '=' + urlValue;
      } else {
        hashData += urlKey + '=' + urlValue;
        i = 1;
      }
    }
    return hashData;
  }

  // Theo doc: ksort theo key
  sortObject(obj: any): Record<string, string> {
    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        const value = obj[key];
        if (value !== undefined && value !== null && value !== '') {
          sorted[key] = value.toString();
        }
      });
    return sorted;
  }

  // Verify signature theo doc (cho IPN/Return)
  verifySignature(data: any, signature: string): boolean {
    const hashData = this.buildHashData(data);
    const checkSum = crypto
      .createHmac('sha512', this.configService.get<string>('VNPAY_SECRET_KEY')!)
      .update(hashData)
      .digest('hex');
    return checkSum === signature;
  }

  // Build URL theo doc đầy đủ (thêm optional billing/invoice nếu có từ order)
  buildPaymentUrl(
    orderId: string,
    amount: number,
    orderInfo: string,
    // Optional theo doc (lấy từ order nếu có)
    billMobile?: string,
    billEmail?: string,
    billFullName?: string,
    billAddress?: string,
    billCity?: string,
    billCountry = 'VN',
    billState?: string,
    invPhone?: string,
    invEmail?: string,
    invCustomer?: string,
    invAddress?: string,
    invCompany?: string,
    invTaxcode?: string,
    invType?: string,
    bankCode?: string,  // Optional: force bank
  ): string {
    const createDate = new Date();
    const expireDate = new Date(Date.now() + 15 * 60 * 1000);  // 15 phút theo doc

    // Parse fullName nếu có (theo doc PHP)
    let billFirstName = '';
    let billLastName = '';
    if (billFullName) {
      const nameParts = billFullName.trim().split(' ');
      billFirstName = nameParts.shift() || '';
      billLastName = nameParts.pop() || '';
    }

    const inputData: Record<string, string> = {
      vnp_Version: '2.1.0',  // Bắt buộc theo doc
      vnp_Command: 'pay',
      vnp_TmnCode: this.configService.get<string>('VNPAY_TMN_CODE')!,
      vnp_Amount: (amount * 100).toString(),  // ×100 theo doc
      vnp_CreateDate: this.formatDate(createDate),
      vnp_CurrCode: 'VND',
      vnp_IpAddr: '127.0.0.1',  // Theo doc: dùng REMOTE_ADDR (localhost cho test)
      vnp_Locale: 'vn',  // Theo doc: vn hoặc en
      vnp_OrderInfo: orderInfo,  // Không dấu theo doc (xử lý encode sau)
      vnp_OrderType: 'other',  // Theo doc: 'other' nếu không có mã cụ thể (hoặc '250000' cho bill payment)
      vnp_ReturnUrl: this.configService.get<string>('VNPAY_RETURN_URL')!,
      vnp_TxnRef: orderId.substring(0, 30),  // Unique per day theo doc
      vnp_ExpireDate: this.formatDate(expireDate),
      // Optional billing theo doc
      vnp_Bill_Mobile: billMobile || '',
      vnp_Bill_Email: billEmail || '',
      vnp_Bill_FirstName: billFirstName,
      vnp_Bill_LastName: billLastName,
      vnp_Bill_Address: billAddress || '',
      vnp_Bill_City: billCity || '',
      vnp_Bill_Country: billCountry,
      vnp_Bill_State: billState || '',
      // Optional invoice theo doc
      vnp_Inv_Phone: invPhone || '',
      vnp_Inv_Email: invEmail || '',
      vnp_Inv_Customer: invCustomer || '',
      vnp_Inv_Address: invAddress || '',
      vnp_Inv_Company: invCompany || '',
      vnp_Inv_Taxcode: invTaxcode || '',
      vnp_Inv_Type: invType || '',
    };

    // Optional bank code theo doc
    if (bankCode) {
      inputData['vnp_BankCode'] = bankCode;
    }

    // Theo doc: ksort + build hashData với encode
    const hashData = this.buildHashData(inputData);

    // Compute SecureHash theo doc (HMAC-SHA512)
    const secureHash = crypto
      .createHmac('sha512', this.configService.get<string>('VNPAY_SECRET_KEY')!)
      .update(hashData)
      .digest('hex');

    // Build query string (encode tất cả theo doc)
    const query = new URLSearchParams(inputData).toString() + '&vnp_SecureHash=' + secureHash;
    return `${this.configService.get<string>('VNPAY_SANDBOX_URL')}?${query}`;
  }
}