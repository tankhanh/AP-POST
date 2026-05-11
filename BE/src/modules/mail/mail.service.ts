import { Injectable } from '@nestjs/common';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { existsSync } from 'fs';

@Injectable()
export class MailService {
  private apiInstance: SibApiV3Sdk.TransactionalEmailsApi;

  constructor() {
    const client = SibApiV3Sdk.ApiClient.instance;

    client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY || '';

    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  }

  private formatPrice(num: number): string {
    return num.toLocaleString('vi-VN');
  }

  // ================= TEMPLATE RENDER =================
  private renderTemplate(templateName: string, context: any): string {
    const distTemplatePath = path.join(
      process.cwd(),
      'dist/modules/mail/templates',
      `${templateName}.hbs`,
    );

    const srcTemplatePath = path.join(
      process.cwd(),
      'src/modules/mail/templates',
      `${templateName}.hbs`,
    );

    const templatePath = existsSync(distTemplatePath)
      ? distTemplatePath
      : srcTemplatePath;

    const source = fs.readFileSync(templatePath, 'utf8');

    const compiled = handlebars.compile(source);

    return compiled(context);
  }

  // ================= SEND TEMPLATE MAIL =================
  async sendTemplateMail(
    to: string,
    subject: string,
    template: string,
    context: any,
  ): Promise<boolean> {
    try {
      const htmlContent = this.renderTemplate(template, context);

      await this.apiInstance.sendTransacEmail({
        sender: {
          email: process.env.EMAIL_FROM || '',
          name: 'AP Post',
        },

        to: [{ email: to }],

        subject,

        htmlContent,
      });

      console.log(`📧 EMAIL ĐÃ GỬI → ${to}`);

      return true;
    } catch (error) {
      console.error('❌ BREVO SEND ERROR:', error);
      return false;
    }
  }

  // ================= GENERIC HTML =================
  async send(to: string, subject: string, html: string): Promise<boolean> {
    try {
      await this.apiInstance.sendTransacEmail({
        sender: {
          email: process.env.EMAIL_FROM || '',
          name: 'AP Post',
        },

        to: [{ email: to }],

        subject,

        htmlContent: html,
      });

      return true;
    } catch (error) {
      console.error('❌ GENERIC MAIL ERROR:', error);
      return false;
    }
  }

  // ================= VERIFY EMAIL =================
  async sendVerificationEmail(
    email: string,
    name: string,
    codeId: string,
  ): Promise<boolean> {
    return this.sendTemplateMail(email, 'Activate your account', 'register', {
      name: name ?? email,
      activationCode: codeId,
    });
  }

  // ================= RESET PASSWORD =================
  async sendResetPasswordEmail(
    email: string,
    name: string,
    codeId: string,
  ): Promise<boolean> {
    return this.sendTemplateMail(
      email,
      'Change your password active code',
      'resetpassword',
      {
        name,
        resetCode: codeId,
      },
    );
  }

  // ================= ORDER CONFIRM =================
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

    await this.sendTemplateMail(
      params.to,
      `Đơn hàng ${params.waybill} đã được tạo thành công! | AP Post`,
      'status/pending',
      context,
    );
  }

  // ================= STATUS UPDATE =================
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

    if (!config) return;

    const context = {
      name: params.receiverName || 'Khách hàng',
      waybill: params.waybill,
      status: params.status,
      trackingUrl: params.trackingUrl,
      codValue: params.codValue ? this.formatPrice(params.codValue) : null,
    };

    await this.sendTemplateMail(
      params.to,
      `${config.subject} | ${params.waybill}`,
      config.templateKey,
      context,
    );
  }
}
