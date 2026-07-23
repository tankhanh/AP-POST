import { validateEnvironment } from './validate-environment';

const validConfig = {
  MONGO_URL: 'mongodb://127.0.0.1:27017/ap-post-test',
  JWT_ACCESS_TOKEN_SECRET: 'access-secret',
  JWT_ACCESS_EXPIRE: '15m',
  JWT_REFRESH_TOKEN: 'refresh-secret',
  JWT_REFRESH_EXPIRE: '7d',
};

describe('validateEnvironment', () => {
  it('applies safe defaults and normalizes the port', () => {
    expect(validateEnvironment({ ...validConfig, PORT: '8080' })).toMatchObject(
      {
        PORT: 8080,
        NODE_ENV: 'development',
      },
    );
  });

  it('reports every missing required variable', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).toThrow(
      'MONGO_URL, JWT_ACCESS_TOKEN_SECRET, JWT_ACCESS_EXPIRE, JWT_REFRESH_TOKEN, JWT_REFRESH_EXPIRE',
    );
  });

  it.each(['0', '65536', 'not-a-number'])('rejects invalid port %s', (port) => {
    expect(() => validateEnvironment({ ...validConfig, PORT: port })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });

  it('requires a strong password when database seeding is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        SHOULD_INIT: 'true',
        INIT_PASSWORD: '123456',
      }),
    ).toThrow('INIT_PASSWORD must contain at least 2 characters');
  });

  it('enforces independent strong secrets in production', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow('Production JWT secrets must be at least 32 characters');

    const sharedSecret = 'x'.repeat(40);
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_TOKEN_SECRET: sharedSecret,
        JWT_REFRESH_TOKEN: sharedSecret,
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow('Access and refresh token secrets must be different');
  });

  it('rejects unsafe production URLs', () => {
    const productionConfig = {
      ...validConfig,
      NODE_ENV: 'production',
      JWT_ACCESS_TOKEN_SECRET: 'a'.repeat(40),
      JWT_REFRESH_TOKEN: 'b'.repeat(40),
      CORS_ORIGINS: 'https://app.example.com',
      EMAIL_AUTH_USER: 'mailer@example.com',
      EMAIL_AUTH_PASS: 'app-password',
    };
    expect(() =>
      validateEnvironment({
        ...productionConfig,
        FRONTEND_URL: 'http://app.example.com',
      }),
    ).toThrow('FRONTEND_URL must be a valid HTTPS URL in production');
  });

  it('rejects partially configured integrations', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        MOMO_PARTNER_CODE: 'partner',
      }),
    ).toThrow('MoMo configuration is incomplete');
  });

  it('requires SMTP credentials in production', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_TOKEN_SECRET: 'a'.repeat(40),
        JWT_REFRESH_TOKEN: 'b'.repeat(40),
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow('Production email delivery requires');
  });
});
