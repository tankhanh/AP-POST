import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { MailService } from './mail.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/health/decorator/roles.decorator';

interface SendMailDto {
  to: string;
  subject: string;
  html?: string; // gửi HTML thô
  template?: string; // tên template (status/pending, ...)
  context?: any; // dữ liệu cho template
}

@Controller('mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send')
  async send(@Body() body: SendMailDto) {
    if (!this.mailService.isConfigured()) {
      throw new ServiceUnavailableException('Brevo is not configured');
    }

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
