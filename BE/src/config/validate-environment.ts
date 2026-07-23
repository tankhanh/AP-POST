const requiredVariables = [
  'MONGO_URL',
  'JWT_ACCESS_TOKEN_SECRET',
  'JWT_ACCESS_EXPIRE',
  'JWT_REFRESH_TOKEN',
  'JWT_REFRESH_EXPIRE',
] as const;

export function validateEnvironment(
  rawConfig: Record<string, unknown>,
): Record<string, unknown> {
  const config = { ...rawConfig };
  const missing = requiredVariables.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const port = Number(config.PORT ?? 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const nodeEnv = String(config.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const mongoUrl = String(config.MONGO_URL);
  if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUrl)) {
    throw new Error('MONGO_URL must use mongodb:// or mongodb+srv://');
  }

  const ensureCompleteGroup = (name: string, keys: string[]) => {
    const present = keys.filter((key) => String(config[key] ?? '').trim());
    if (present.length > 0 && present.length !== keys.length) {
      throw new Error(
        `${name} configuration is incomplete: ${keys.join(', ')}`,
      );
    }
  };
  ensureCompleteGroup('Brevo', ['BREVO_API_KEY']);
  ensureCompleteGroup('MoMo', [
    'MOMO_PARTNER_CODE',
    'MOMO_ACCESS_KEY',
    'MOMO_SECRET_KEY',
  ]);

  const durationPattern = /^[1-9]\d*(?:ms|s|m|h|d|w|y)$/i;
  for (const key of ['JWT_ACCESS_EXPIRE', 'JWT_REFRESH_EXPIRE'] as const) {
    if (!durationPattern.test(String(config[key]))) {
      throw new Error(`${key} must be a duration such as 15m or 7d`);
    }
  }

  if (
    String(config.SHOULD_INIT ?? 'false') === 'true' &&
    String(config.INIT_PASSWORD ?? '').length < 2
  ) {
    throw new Error(
      'INIT_PASSWORD must contain at least 2 characters when SHOULD_INIT=true',
    );
  }

  if (nodeEnv === 'production') {
    const accessSecret = String(config.JWT_ACCESS_TOKEN_SECRET);
    const refreshSecret = String(config.JWT_REFRESH_TOKEN);
    if (accessSecret.length < 32 || refreshSecret.length < 32) {
      throw new Error('Production JWT secrets must be at least 32 characters');
    }
    if (accessSecret === refreshSecret) {
      throw new Error('Access and refresh token secrets must be different');
    }
    if (!config.CORS_ORIGINS || String(config.CORS_ORIGINS).includes('*')) {
      throw new Error('Production CORS_ORIGINS must be an explicit allowlist');
    }
    const origins = String(config.CORS_ORIGINS)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (
      origins.length === 0 ||
      origins.some((origin) => {
        try {
          return new URL(origin).protocol !== 'https:';
        } catch {
          return true;
        }
      })
    ) {
      throw new Error('Production CORS origins must be valid HTTPS URLs');
    }
    for (const key of [
      'FRONTEND_URL',
      'PUBLIC_APP_URL',
      'API_BASE_URL',
      'MOMO_ENDPOINT',
      'MOMO_QUERY_ENDPOINT',
    ]) {
      const value = String(config[key] ?? '').trim();
      if (!value) continue;
      try {
        if (new URL(value).protocol !== 'https:') throw new Error();
      } catch {
        throw new Error(`${key} must be a valid HTTPS URL in production`);
      }
    }
    if (!String(config.BREVO_API_KEY ?? '').trim()) {
      throw new Error('Production email delivery requires BREVO_API_KEY');
    }
    for (const key of [
      'FRONTEND_URL',
      'API_BASE_URL',
      'MOMO_PARTNER_CODE',
      'MOMO_ACCESS_KEY',
      'MOMO_SECRET_KEY',
      'MOMO_ENDPOINT',
      'MOMO_QUERY_ENDPOINT',
    ]) {
      if (!String(config[key] ?? '').trim()) {
        throw new Error(`Production deployment requires ${key}`);
      }
    }
    if (String(config.SHOULD_INIT ?? 'false') === 'true') {
      throw new Error('SHOULD_INIT must be false in production');
    }
    if (String(config.MOMO_CONFIRM_ON_RETURN ?? 'false') === 'true') {
      throw new Error('MOMO_CONFIRM_ON_RETURN must be false in production');
    }
  }

  config.PORT = port;
  config.NODE_ENV = nodeEnv;
  return config;
}
