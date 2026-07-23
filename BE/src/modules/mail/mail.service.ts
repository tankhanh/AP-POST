import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import Handlebars from 'handlebars';
import nodemailer, { Transporter } from 'nodemailer';
import { resolve, sep } from 'path';

interface TemplateMailOptions {
  to: string;
  subject: string;
  html?: string;
  template?: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  private readonly templateRoot = resolve(__dirname, 'templates');
  private readonly templateCache = new Map<
    string,
    Handlebars.TemplateDelegate
  >();

  constructor(private readonly configService: ConfigService) {
    const user = configService.get<string>('EMAIL_AUTH_USER')?.trim();
    const pass = configService.get<string>('EMAIL_AUTH_PASS')?.trim();
    if (!user || !pass) {
      this.logger.warn(
        'SMTP chưa được cấu hình; email thông báo sẽ được bỏ qua trong môi trường hiện tại.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: configService.get<string>('EMAIL_HOST', 'smtp.gmail.com'),
      port: Number(configService.get<string>('EMAIL_PORT', '587')),
      secure: configService.get<string>('EMAIL_SECURE', 'false') === 'true',
      requireTLS: true,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async sendMail(options: TemplateMailOptions) {
    if (!this.transporter) {
      throw new ServiceUnavailableException('SMTP is not configured');
    }

    const html = options.template
      ? await this.renderTemplate(options.template, {
          supportEmail: this.configService.get<string>(
            'SUPPORT_EMAIL',
            'support@ap-post.vn',
          ),
          supportPhone: this.configService.get<string>(
            'SUPPORT_PHONE',
            '0908779245',
          ),
          ...(options.context ?? {}),
        })
      : options.html;
    if (!html) throw new Error('Email HTML or template is required');

    return this.transporter.sendMail({
      from:
        this.configService.get<string>('EMAIL_FROM')?.trim() ||
        this.configService.get<string>('EMAIL_AUTH_USER'),
      to: options.to,
      subject: options.subject,
      html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }

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
    await this.trySend({
      to: params.to,
      subject: `Đơn hàng ${params.waybill} đã được tạo thành công! | AP Post`,
      template: 'status/pending',
      context: {
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
      },
    });
  }

  async sendStatusUpdate(params: {
    to: string;
    receiverName: string;
    waybill: string;
    status: string;
    trackingUrl: string;
    codValue?: number;
  }): Promise<void> {
    if (!params.to) return;
    const statusMap: Record<string, { subject: string; template: string }> = {
      PENDING: { subject: 'Đơn hàng của bạn đã được tạo', template: 'pending' },
      CONFIRMED: {
        subject: 'Đơn hàng đã được xác nhận',
        template: 'confirmed',
      },
      SHIPPING: {
        subject: 'Đơn hàng đang trên đường giao đến bạn',
        template: 'shipping',
      },
      COMPLETED: {
        subject: 'Giao hàng thành công! Cảm ơn bạn',
        template: 'completed',
      },
      CANCELED: { subject: 'Đơn hàng đã bị hủy', template: 'canceled' },
    };
    const selected = statusMap[params.status];
    if (!selected) return;

    await this.trySend({
      to: params.to,
      subject: `${selected.subject} | ${params.waybill}`,
      template: `status/${selected.template}`,
      context: {
        name: params.receiverName || 'Khách hàng',
        waybill: params.waybill,
        status: params.status,
        trackingUrl: params.trackingUrl,
        codValue: params.codValue ? this.formatPrice(params.codValue) : null,
      },
    });
  }

  async send(
    to: string,
    subject: string,
    templateOrHtml: string,
    context?: Record<string, unknown>,
  ): Promise<boolean> {
    return this.trySend({
      to,
      subject,
      ...(context
        ? { template: templateOrHtml, context }
        : { html: templateOrHtml }),
    });
  }

  private async renderTemplate(
    template: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    const name = template.replace(/\.hbs$/i, '').replace(/\\/g, '/');
    if (!/^[a-zA-Z0-9/_-]+$/.test(name)) {
      throw new Error('Invalid email template name');
    }
    const path = resolve(this.templateRoot, `${name}.hbs`);
    if (!path.startsWith(`${this.templateRoot}${sep}`)) {
      throw new Error('Invalid email template path');
    }

    let compiled = this.templateCache.get(path);
    if (!compiled) {
      compiled = Handlebars.compile(await readFile(path, 'utf8'), {
        strict: true,
      });
      this.templateCache.set(path, compiled);
    }
    return compiled(context);
  }

  private async trySend(options: TemplateMailOptions): Promise<boolean> {
    if (!this.transporter) return false;

    try {
      await this.sendMail(options);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email', error);
      return false;
    }
  }

  private formatPrice(value: number): string {
    return value.toLocaleString('vi-VN');
  }
}
