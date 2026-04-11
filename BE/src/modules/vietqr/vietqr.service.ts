import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class VietQrService {
  private readonly acqId: string;
  private readonly accountNo: string;
  private readonly templateId: string;
  private readonly accountName: string;

  constructor() {
    this.acqId = process.env.VIETQR_ACQ_ID || '';
    this.accountNo = process.env.VIETQR_ACCOUNT_NO || '';
    this.templateId = process.env.VIETQR_TEMPLATE_ID || '';
    this.accountName = process.env.VIETQR_ACCOUNT_NAME || 'NORSMITHER';

    if (!this.acqId || !this.accountNo || !this.templateId) {
      console.error('❌ VietQR config bị thiếu trong .env');
      console.error('VIETQR_ACQ_ID:', this.acqId);
      console.error('VIETQR_ACCOUNT_NO:', this.accountNo);
      console.error('VIETQR_TEMPLATE_ID:', this.templateId);
    }
  }

  /**
   * Tạo URL QR giống hệt Quick Link trong VietQR
   */
  generateQrUrl(amount: number, waybill: string, description?: string): string {
    if (!this.acqId || !this.accountNo || !this.templateId) {
      throw new BadRequestException(
        'VietQR configuration chưa đầy đủ. Kiểm tra file .env',
      );
    }

    const baseUrl = `https://api.vietqr.io/image/${this.acqId}-${this.accountNo}-${this.templateId}.jpg`;

    const params = new URLSearchParams({
      amount: Math.round(amount).toString(),
      addInfo: description || `Thanh toan don hang AP Post - ${waybill}`,
      accountName: this.accountName,
    });

    const fullUrl = `${baseUrl}?${params.toString()}`;

    console.log('✅ Generated VietQR URL:', fullUrl);
    return fullUrl;
  }
}
