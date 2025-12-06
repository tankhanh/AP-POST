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

  // QUAN TRỌNG: VNPAY yêu cầu encodeURIComponent cho VALUE, nhưng KEY thì KHÔNG encode khi build hash
  private buildHashData(params: Record<string, string>): string {
    const sortedParams = this.sortObject(params);
    return Object.keys(sortedParams)
      .map((key) => {
        const value = sortedParams[key];
        if (value === '' || value === undefined || value === null) {
          return `${key}=`; // vẫn giữ key nếu value rỗng
        }
        return `${key}=${encodeURIComponent(value)}`;
      })
      .join('&');
  }

  private sortObject(obj: Record<string, any>): Record<string, string> {
    const sorted: Record<string, string> = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        const value = obj[key];
        if (value !== undefined && value !== null) {
          sorted[key] = value.toString();
        }
      });
    return sorted;
  }

  verifySignature(data: Record<string, any>, signature: string): boolean {
    const hashData = this.buildHashData(data);
    const checkSum = crypto
      .createHmac('sha512', this.configService.get<string>('VNPAY_SECRET_KEY')!)
      .update(hashData)
      .digest('hex');
    return checkSum.toLowerCase() === signature.toLowerCase(); // VNPAY trả về chữ thường
  }

  buildPaymentUrl(
    orderId: string,
    amount: number,
    orderInfo: string,
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
    bankCode?: string,
  ): string {
    const createDate = new Date();

    // QUAN TRỌNG: Đặt expire 30–60 phút khi dev/test để tránh lỗi 15
    const expireDate = new Date(Date.now() + 60 * 60 * 1000); // 60 phút

    let billFirstName = '';
    let billLastName = '';
    if (billFullName) {
      const parts = billFullName.trim().split(/\s+/);
      billFirstName = parts.shift() || '';
      billLastName = parts.pop() || '';
      if (parts.length > 0) billLastName = parts.join(' ') + ' ' + billLastName;
    }

    const inputData: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.configService.get<string>('VNPAY_TMN_CODE')!,
      vnp_Amount: (amount * 100).toString(),
      vnp_CreateDate: this.formatDate(createDate),
      vnp_ExpireDate: this.formatDate(expireDate), // ← ĐÃ TĂNG LÊN 60 PHÚT
      vnp_CurrCode: 'VND',
      vnp_IpAddr: '127.0.0.1',
      vnp_Locale: 'vn',
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: '250000', // ← Khuyến khích dùng mã ngành hàng thay vì "other"
      vnp_ReturnUrl: this.configService.get<string>('VNPAY_RETURN_URL')!,
      vnp_TxnRef: orderId.substring(0, 30),
      // Billing info
      vnp_Bill_Mobile: billMobile || '',
      vnp_Bill_Email: billEmail || '',
      vnp_Bill_FirstName: billFirstName,
      vnp_Bill_LastName: billLastName,
      vnp_Bill_Address: billAddress || '',
      vnp_Bill_City: billCity || '',
      vnp_Bill_Country: billCountry,
      vnp_Bill_State: billState || '',
      // Invoice info (nếu cần hóa đơn)
      vnp_Inv_Phone: invPhone || '',
      vnp_Inv_Email: invEmail || '',
      vnp_Inv_Customer: invCustomer || '',
      vnp_Inv_Address: invAddress || '',
      vnp_Inv_Company: invCompany || '',
      vnp_Inv_Taxcode: invTaxcode || '',
      vnp_Inv_Type: invType || '',
    };

    if (bankCode) {
      inputData.vnp_BankCode = bankCode;
    }

    const hashData = this.buildHashData(inputData);
    const secureHash = crypto
      .createHmac('sha512', this.configService.get<string>('VNPAY_SECRET_KEY')!)
      .update(hashData)
      .digest('hex');

    // Tạo URL đúng chuẩn: dùng URLSearchParams để encode tự động
    const params = new URLSearchParams(inputData);
    params.append('vnp_SecureHash', secureHash);

    const baseUrl = this.configService.get<string>('VNPAY_SANDBOX_URL') || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    return `${baseUrl}?${params.toString()}`;
  }
}