declare global {
  interface Window {
    __AP_POST_CONFIG__?: { apiBaseUrl?: string };
  }
}

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const resolveRuntimeEnvironment = () => {
  const host = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const runtimeUrl =
    typeof window !== 'undefined' ? window.__AP_POST_CONFIG__?.apiBaseUrl : undefined;
  const fallbackUrl = isLocal
    ? 'http://localhost:8000/api/v1'
    : 'https://ap-post-api.onrender.com/api/v1';

  return {
    production: !isLocal,
    apiBaseUrl: normalizeBaseUrl(runtimeUrl || fallbackUrl),
  };
};

const runtime = resolveRuntimeEnvironment();

export const env = {
  production: runtime.production,
  baseUrl: runtime.apiBaseUrl,
  apiUrl: runtime.apiBaseUrl,
};
