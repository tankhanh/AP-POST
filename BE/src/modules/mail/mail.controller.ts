import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { MailService } from './mail.service';
import { Public } from 'src/health/decorator/customize';

interface SendMailDto {
  to: string;
  subject: string;
  html?: string;           // gửi HTML thô
  template?: string;       // tên template (status/pending, ...)
  context?: any;           // dữ liệu cho template
}

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send')
  @Public()
  async send(@Body() body: SendMailDto) {
    let result = false;

    if (body.template && body.context) {
      // Gửi theo template
      result = await this.mailService.send(
        body.to,
        body.subject,
        body.template,
        body.context,
      );
    } else if (body.html) {
      // Gửi HTML thô (giữ tương thích cũ)
      result = await this.mailService.send(body.to, body.subject, body.html);
    } else {
      throw new HttpException(
        { msg: 'Cần truyền html hoặc (template + context)' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (result) {
      return { msg: 'Email sent successfully' };
    } else {
      throw new HttpException(
        { msg: 'Failed to send email' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}