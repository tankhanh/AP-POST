import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    console.log('RESEND_API_KEY:', key ? 'ĐÃ LOAD OK' : 'KHÔNG CÓ KEY');
    if (!key) {
      console.warn(
        'CẢNH BÁO: RESEND_API_KEY chưa được set → email sẽ không gửi!',
      );
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
    await this.resend.emails.send({
      from: 'AP POST <onboarding@resend.dev>',
      to: params.to,
      subject: 'Xác nhận đơn hàng thành công!',
      html: `
        <h2>Xin chào ${params.receiverName}!</h2>
        <p>Đơn hàng của bạn đã được tạo thành công.</p>
        <p><strong>Mã vận đơn:</strong> <h3>${params.waybill}</h3></p>
        <p>Tổng tiền: <strong>${params.totalPrice.toLocaleString()}đ</strong> (Phí ship: ${params.shippingFee.toLocaleString()}đ + COD: ${params.codValue.toLocaleString()}đ)</p>
        <p>Tra cứu hành trình: <a href="https://ap-post.vercel.app/tracking/${
          params.waybill
        }">Nhấn vào đây</a></p>
        <br>
        <p>Cảm ơn bạn đã sử dụng AP POST!</p>
      `,
    });
  }

  // Các hàm khác: status update, v.v.
}
