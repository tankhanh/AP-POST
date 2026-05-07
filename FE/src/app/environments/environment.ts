const resolveApiBaseUrl = () => {
  const host =
    typeof window !== 'undefined' && window.location ? window.location.hostname : '';

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:8000/api/v1';
  }

  return 'https://ap-post-api.onrender.com/api/v1';
};

const apiBaseUrl = resolveApiBaseUrl();

export const env = {
  production: false,
  baseUrl: apiBaseUrl,
  apiUrl: apiBaseUrl,
};
