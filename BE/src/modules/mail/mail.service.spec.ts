import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('skips optional delivery cleanly when SMTP is not configured', async () => {
    const service = new MailService(
      new ConfigService({
        EMAIL_FROM: 'AP Post <no-reply@example.com>',
      }),
    );

    expect(service.isConfigured()).toBe(false);
    await expect(
      service.send('customer@example.com', 'Subject', '<p>Hello</p>'),
    ).resolves.toBe(false);
  });

  it('recognizes a complete SMTP configuration', () => {
    const service = new MailService(
      new ConfigService({
        EMAIL_AUTH_USER: 'mailer@example.com',
        EMAIL_AUTH_PASS: 'app-password',
      }),
    );

    expect(service.isConfigured()).toBe(true);
  });
});
