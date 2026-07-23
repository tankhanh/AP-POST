import { LanguageService } from './language.service';
import { TranslatePipe } from './translate.pipe';

describe('LanguageService', () => {
  const storageKey = 'ap-post-language';
  let originalTitle: string;
  let originalLanguage: string;
  let ogLocaleMeta: HTMLMetaElement;

  beforeEach(() => {
    originalTitle = document.title;
    originalLanguage = document.documentElement.lang;
    localStorage.removeItem(storageKey);
    ogLocaleMeta = document.createElement('meta');
    ogLocaleMeta.setAttribute('property', 'og:locale');
    document.head.appendChild(ogLocaleMeta);
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
    document.title = originalTitle;
    document.documentElement.lang = originalLanguage;
    delete document.documentElement.dataset['language'];
    ogLocaleMeta.remove();
  });

  it('switches language, persists the preference, and updates document metadata', () => {
    const service = new LanguageService(document, 'browser' as unknown as object);

    service.setLanguage('en');

    expect(service.language()).toBe('en');
    expect(service.locale()).toBe('en-US');
    expect(localStorage.getItem(storageKey)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dataset['language']).toBe('en');
    expect(document.title).toContain('Fast delivery');
    expect(ogLocaleMeta.getAttribute('content')).toBe('en_US');
  });

  it('restores a persisted language and translates exact, dynamic, and interpolated text', () => {
    localStorage.setItem(storageKey, 'en');
    const service = new LanguageService(document, 'browser' as unknown as object);

    expect(service.language()).toBe('en');
    expect(service.t('Đăng nhập')).toBe('Sign in');
    expect(service.t('Trang 2 / 5')).toBe('Page 2 / 5');
    expect(service.t('Hello {name}', { name: 'Lan' })).toBe('Hello Lan');
  });

  it('keeps Vietnamese source text when Vietnamese is active', () => {
    const service = new LanguageService(document, 'browser' as unknown as object);

    expect(service.t('Đăng nhập')).toBe('Đăng nhập');
    expect(service.locale()).toBe('vi-VN');
  });
});

describe('TranslatePipe', () => {
  beforeEach(() => localStorage.removeItem('ap-post-language'));
  afterEach(() => localStorage.removeItem('ap-post-language'));

  it('reacts to the active language and supports interpolation parameters', () => {
    const service = new LanguageService(document, 'browser' as unknown as object);
    const pipe = new TranslatePipe(service);

    expect(pipe.transform('Đăng nhập')).toBe('Đăng nhập');
    service.setLanguage('en');
    expect(pipe.transform('Đăng nhập')).toBe('Sign in');
    expect(pipe.transform('Hello {{name}}', { name: 'AP Post' })).toBe('Hello AP Post');
    expect(pipe.transform(null)).toBe('');
  });
});
