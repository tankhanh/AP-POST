// src/mail/mail.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import SendGridMail from '@sendgrid/mail';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

const VERIFIED_SENDER_EMAIL = process.env.VERIFIED_SENDER_EMAIL;

@Injectable()
export class MailService implements OnModuleInit {
  private templates: Record<string, HandlebarsTemplateDelegate> = {};

  constructor() {
    const key = process.env.SENDGRID_API_KEY?.trim();
    console.log('SENDGRID_API_KEY loaded:', key ? 'YES (hidden)' : 'NO');
    console.log('VERIFIED_SENDER_EMAIL:', VERIFIED_SENDER_EMAIL ? 'YES' : 'NO');

    if (!key || !VERIFIED_SENDER_EMAIL) {
      console.warn('CẢNH BÁO: Thiếu SENDGRID_API_KEY hoặc VERIFIED_SENDER_EMAIL → không gửi được email!');
    } else {
      SendGridMail.setApiKey(key);   // DÙNG SendGridMail, không phải sgMail
    }
  }

  onModuleInit() {
    this.loadAllTemplates();
  }

  private loadAllTemplates() {
    // DÙNG process.cwd() để lấy root project, chắc chắn đúng
    const templatesDir = path.join(process.cwd(), 'src', 'mail', 'templates');

    const files = [
      'status/pending.hbs',
      'status/confirmed.hbs',
      'status/shipping.hbs',
      'status/completed.hbs',
      'status/canceled.hbs',
      'status/restore.hbs',
    ];

    files.forEach((file) => {
      const fullPath = path.join(templatesDir, file);
      if (fs.existsSync(fullPath)) {
        const source = fs.readFileSync(fullPath, 'utf8');
        const template = Handlebars.compile(source);
        const key = file.replace('.hbs', '').replace(/\//g, '.');
        this.templates[key] = template;
        console.log(`Template loaded: ${file} → ${key}`);
      } else {
        console.error(`KHÔNG TÌM THẤY FILE TEMPLATE: ${fullPath}`);
      }
    });
  }

  private getTemplate(key: string): HandlebarsTemplateDelegate {
    const template = this.templates[key];
    if (!template) {
      console.error(`Template không tồn tại: ${key}`);
    }
    return template;
  }

  // Gửi email xác nhận đặt hàng
  async sendOrderConfirmation(params: {
    to: string;
    receiverName: string;
    waybill: string;
    totalPrice: number;
    shippingFee: number;
    codValue: number;
  }) {
    if (!params.to || !VERIFIED_SENDER_EMAIL || !process.env.SENDGRID_API_KEY) {
      console.warn('KHÔNG GỬI EMAIL XÁC NHẬN: Thiếu thông tin');
      return;
    }

    const formatPrice = (num: number) => num.toLocaleString('vi-VN');
    const template = this.getTemplate('pending');
    if (!template) return;

    const html = template({
      name: params.receiverName,
      waybill: params.waybill,
      totalPrice: formatPrice(params.totalPrice),
      shippingFee: formatPrice(params.shippingFee),
      codValue: formatPrice(params.codValue),
    });

    await this.send({
      to: params.to,
      subject: `Đơn hàng ${params.waybill} đã được tạo thành công! | AP Post`,
      html,
    });
  }

  // Gửi email cập nhật trạng thái
  async sendStatusUpdate(params: {
    to: string;
    receiverName: string;
    waybill: string;
    status: string;
    trackingUrl: string;
    codValue?: number;
  }) {
    if (!params.to || !VERIFIED_SENDER_EMAIL || !process.env.SENDGRID_API_KEY) {
      console.warn('KHÔNG GỬI EMAIL TRẠNG THÁI: Thiếu thông tin');
      return;
    }

    const statusMap: Record<string, { subject: string; templateKey: string }> = {
      PENDING: { subject: 'Đơn hàng của bạn đã được tạo', templateKey: 'status.pending' },
      CONFIRMED: { subject: 'Đơn hàng đã được xác nhận ✓', templateKey: 'status.confirmed' },
      SHIPPING: { subject: 'Đơn hàng đang trên đường giao đến bạn', templateKey: 'status.shipping' },
      COMPLETED: { subject: 'Giao hàng thành công! Cảm ơn bạn', templateKey: 'status.completed' },
      CANCELED: { subject: 'Đơn hàng đã bị hủy', templateKey: 'status.canceled' },
    };

    const config = statusMap[params.status];
    if (!config) return;

    const template = this.getTemplate(config.templateKey);
    if (!template) return;

    const html = template({
      name: params.receiverName || 'Khách hàng',
      waybill: params.waybill,
      status: params.status,
      trackingUrl: params.trackingUrl,
      codValue: params.codValue ? params.codValue.toLocaleString('vi-VN') : null,
    });

    await this.send({
      to: params.to,
      subject: config.subject,
      html,
    });
  }

  // Hàm chung gửi email
  private async send(msg: {
    to: string;
    subject: string;
    html: string;
  }) {
    try {
      console.log('ĐANG GỬI EMAIL ĐẾN:', msg.to);
      const message = {
        from: {
          email: VERIFIED_SENDER_EMAIL!,
          name: 'AP Post',
        },
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      };

      const [response] = await SendGridMail.send(message);
      console.log(`EMAIL GỬI THÀNH CÔNG → ${msg.to} | Status: ${response.statusCode}`);
    } catch (err: any) {
      const errorDetail = err.response?.body?.errors
        ? JSON.stringify(err.response.body.errors)
        : err.message;
      console.error('LỖI GỬI EMAIL SENDGRID:', errorDetail);
    }
  }
}