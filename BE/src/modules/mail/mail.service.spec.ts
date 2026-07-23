import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('skips optional delivery cleanly when Brevo is not configured', async () => {
    const service = new MailService(new ConfigService({}));

    expect(service.isConfigured()).toBe(false);

    await expect(
      service.send('customer@example.com', 'Subject', '<p>Hello</p>'),
    ).resolves.toBe(false);
  });

  it('recognizes a complete Brevo configuration', () => {
    const service = new MailService(
      new ConfigService({
        BREVO_API_KEY: 'test-brevo-api-key',
        BREVO_SENDER_EMAIL: 'no-reply@example.com',
        BREVO_SENDER_NAME: 'AP Post',
      }),
    );

    expect(service.isConfigured()).toBe(true);
  });
});
