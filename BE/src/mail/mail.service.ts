import { Injectable, OnModuleInit } from '@nestjs/common';
import { Resend } from 'resend';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService implements OnModuleInit {
  private resend: Resend;
  private orderConfirmationTemplate: HandlebarsTemplateDelegate;

  constructor() {
    const key = process.env.RESEND_API_KEY?.trim();

    console.log('RESEND_API_KEY loaded:', key ? 'YES (hidden)' : 'NO → EMAIL SẼ KHÔNG GỬI ĐƯỢC');

    if (!key) {
      console.warn('CẢNH BÁO: Không có RESEND_API_KEY → email sẽ không gửi!');
    }

    this.resend = new Resend(key);
  }

  onModuleInit() {
    this.loadTemplates();
  }

  private loadTemplates() {
    try {
      const templatePath = path.join(__dirname, 'templates', 'ordersEmail.hbs');
      const source = fs.readFileSync(templatePath, 'utf8');
      this.orderConfirmationTemplate = Handlebars.compile(source);
      console.log('Template ordersEmail.hbs đã được load thành công');
    } catch (err) {
      console.error('KHÔNG THỂ LOAD TEMPLATE EMAIL:', err);
      throw new Error('Failed to load email templates');
    }
  }

  async sendOrderConfirmation(params: {
    to: string;
    receiverName: string;
    waybill: string;
    totalPrice: number;
    shippingFee: number;
    codValue: number;
  }) {
    if (!params.to) {
      console.log('KHÔNG GỬI EMAIL: Không có địa chỉ email');
      return;
    }

    // Format tiền tệ
    const formatPrice = (num: number) => num.toLocaleString('vi-VN');

    const html = this.orderConfirmationTemplate({
      name: params.receiverName,
      waybill: params.waybill,
      totalPrice: formatPrice(params.totalPrice),
      shippingFee: formatPrice(params.shippingFee),
      codValue: formatPrice(params.codValue),
    });

    try {
      console.log('ĐANG GỬI EMAIL XÁC NHẬN ĐẾN:', params.to);

      const { data, error } = await this.resend.emails.send({
        from: 'AP Post <onboarding@resend.dev>',
        to: [params.to],
        subject: `Đơn hàng ${params.waybill} đã được tạo thành công! | AP Post`,
        html,
      });

      if (error) {
        console.error('LỖI RESEND:', error);
        return;
      }

      console.log('EMAIL GỬI THÀNH CÔNG! ID:', data?.id);
    } catch (err: any) {
      console.error('EXCEPTION KHI GỬI EMAIL:', err.message || err);
    }
  }
}