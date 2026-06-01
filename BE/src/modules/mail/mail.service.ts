// src/modules/mail/mail.service.ts
import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  private formatPrice(num: number): string {
    return num.toLocaleString('vi-VN');
  }

  // ====================== GỬI EMAIL XÁC NHẬN ĐƠN HÀNG ======================
  async sendOrderConfirmation(params: {
    to: string;
    receiverName: string;
    waybill: string;
    shippingFee: number;
    codValue: number;
    senderPayAmount: number;
    receiverPayAmount: number;
    totalOrderValue: number;
    shippingFeePayer: 'SENDER' | 'RECEIVER';
  }): Promise<void> {
    if (!params.to) return;

    const context = {
      name: params.receiverName,
      waybill: params.waybill,
      totalOrderValue: this.formatPrice(params.totalOrderValue),
      shippingFee: this.formatPrice(params.shippingFee),
      codValue: this.formatPrice(params.codValue),
      senderPayAmount: this.formatPrice(params.senderPayAmount),
      receiverPayAmount: this.formatPrice(params.receiverPayAmount),
      shippingFeePayerText:
        params.shippingFeePayer === 'SENDER' ? 'Người gửi' : 'Người nhận',
      isSenderPayFee: params.shippingFeePayer === 'SENDER',
      isReceiverPayFee: params.shippingFeePayer === 'RECEIVER',
    };

    try {
      await this.mailerService.sendMail({
        to: params.to,
        subject: `Đơn hàng ${params.waybill} đã được tạo thành công! | AP Post`,
        template: 'status/pending', // ← Dùng dấu /
        context,
      });
      console.log(`📧 EMAIL XÁC NHẬN ĐÃ GỬI → ${params.to}`);
    } catch (error) {
      console.error('❌ LỖI GỬI EMAIL XÁC NHẬN:', error);
    }
  }

  // ====================== GỬI EMAIL CẬP NHẬT TRẠNG THÁI ======================
  async sendStatusUpdate(params: {
    to: string;
    receiverName: string;
    waybill: string;
    status: string;
    trackingUrl: string;
    codValue?: number;
  }): Promise<void> {
    if (!params.to) return;

    const statusMap: Record<string, { subject: string; templateKey: string }> =
      {
        PENDING: {
          subject: 'Đơn hàng của bạn đã được tạo',
          templateKey: 'status/pending',
        },
        CONFIRMED: {
          subject: 'Đơn hàng đã được xác nhận',
          templateKey: 'status/confirmed',
        },
        SHIPPING: {
          subject: 'Đơn hàng đang trên đường giao đến bạn',
          templateKey: 'status/shipping',
        },
        COMPLETED: {
          subject: 'Giao hàng thành công! Cảm ơn bạn',
          templateKey: 'status/completed',
        },
        CANCELED: {
          subject: 'Đơn hàng đã bị hủy',
          templateKey: 'status/canceled',
        },
      };

    const config = statusMap[params.status];
    if (!config) {
      console.warn(`⚠️ Status không hỗ trợ gửi email: ${params.status}`);
      return;
    }

    const context = {
      name: params.receiverName || 'Khách hàng',
      waybill: params.waybill,
      status: params.status,
      trackingUrl: params.trackingUrl,
      codValue: params.codValue ? this.formatPrice(params.codValue) : null,
    };

    try {
      await this.mailerService.sendMail({
        to: params.to,
        subject: `${config.subject} | ${params.waybill}`,
        template: config.templateKey, // ← Đã dùng đúng /
        context,
      });
      console.log(`📧 EMAIL TRẠNG THÁI ${params.status} ĐÃ GỬI → ${params.to}`);
    } catch (error) {
      console.error(`❌ LỖI GỬI EMAIL TRẠNG THÁI ${params.status}:`, error);
    }
  }

  // ====================== GỬI EMAIL GENERIC (nếu bạn còn dùng) ======================
  async send(
    to: string,
    subject: string,
    templateOrHtml: string,
    context?: any,
  ): Promise<boolean> {
    try {
      const mailOptions: any = { to, subject };

      if (context) {
        mailOptions.template = templateOrHtml;
        mailOptions.context = context;
      } else {
        mailOptions.html = templateOrHtml;
      }

      await this.mailerService.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('❌ Lỗi gửi email generic:', error);
      return false;
    }
  }
}
