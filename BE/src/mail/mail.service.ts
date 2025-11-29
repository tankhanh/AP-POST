// src/mail/mail.service.ts
import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;

  constructor() {
    const key = process.env.RESEND_API_KEY?.trim();
    
    console.log('RESEND_API_KEY loaded:', key ? 'YES (hidden)' : 'NO → EMAIL SẼ KHÔNG GỬI ĐƯỢC');

    if (!key) {
      console.warn('CẢNH BÁO: Không có RESEND_API_KEY → email sẽ không gửi!');
    }

    this.resend = new Resend(key);
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

    try {
      console.log('BẮT ĐẦU GỬI EMAIL QUA RESEND ĐẾN:', params.to);

      const { data, error } = await this.resend.emails.send({
        from: 'AP POST <onboarding@resend.dev>',
        to: [params.to],                              // ← PHẢI LÀ MẢNG
        subject: 'Xác nhận đơn hàng thành công! AP POST',
        html: `
          <h2>Xin chào ${params.receiverName}!</h2>
          <p>Đơn hàng của bạn đã được tạo thành công.</p>
          <p><strong>Mã vận đơn:</strong> <h3>${params.waybill}</h3></p>
          <p>Tổng tiền: <strong>${params.totalPrice.toLocaleString()}₫</strong> 
             (Phí ship: ${params.shippingFee.toLocaleString()}₫ + COD: ${params.codValue.toLocaleString()}₫)</p>
          <p>Tra cứu hành trình: <a href="https://ap-post.vercel.app/tracking/${params.waybill}">Nhấn vào đây</a></p>
          <br>
          <p>Cảm ơn bạn đã sử dụng <strong>AP POST</strong>!</p>
        `,
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