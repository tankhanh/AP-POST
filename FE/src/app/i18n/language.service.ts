import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  computed,
  Inject,
  Injectable,
  PLATFORM_ID,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { ENGLISH_ATTRIBUTES, ENGLISH_PHRASES } from './translations';

export type AppLanguage = 'vi' | 'en';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly storageKey = 'ap-post-language';
  readonly language: WritableSignal<AppLanguage>;
  readonly locale: Signal<string>;

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    this.language = signal<AppLanguage>(this.readInitialLanguage());
    this.locale = computed(() => (this.language() === 'en' ? 'en-US' : 'vi-VN'));
    this.applyDocumentLanguage(this.language());
  }

  setLanguage(language: AppLanguage): void {
    if (language !== 'vi' && language !== 'en') return;
    this.language.set(language);
    this.applyDocumentLanguage(language);
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(this.storageKey, language);
      } catch {
        // Storage can be unavailable in private/locked-down browser contexts.
      }
    }
  }

  translate(value: string, parameters?: Record<string, string | number>): string {
    if (this.language() === 'vi') return value;
    return this.interpolate(this.translateEnglish(value, ENGLISH_PHRASES), parameters);
  }

  translateAttribute(value: string, parameters?: Record<string, string | number>): string {
    if (this.language() === 'vi') return value;
    return this.interpolate(
      this.translateEnglish(value, { ...ENGLISH_PHRASES, ...ENGLISH_ATTRIBUTES }),
      parameters,
    );
  }

  /** Angular-native API for component code and the translate pipe. */
  t(value: string, parameters?: Record<string, string | number>): string {
    return this.translate(value, parameters);
  }

  private translateEnglish(value: string, dictionary: Record<string, string>): string {
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    const text = value.trim();
    if (!text) return value;
    const exact = dictionary[text];
    if (exact) return `${leading}${exact}${trailing}`;

    const dynamicRules: Array<[RegExp, string]> = [
      [/^Trang (\d+) \/ (\d+)$/, 'Page $1 / $2'],
      [/^Tháng (\d+)$/, 'Month $1'],
      [/^Ngày (\d+)$/, 'Day $1'],
      [/^Mã vận đơn:\s*(.+)$/i, 'Waybill: $1'],
      [/^Mã OTP dev:\s*(.+)$/i, 'Dev OTP: $1'],
      [/^Tổng:\s*(.+)$/i, 'Total: $1'],
      [/^Cập nhật:\s*(.+)$/i, 'Updated: $1'],
      [/^Ngày in:\s*(.+)$/i, 'Printed: $1'],
      [/^Bạn có một thanh toán (.+) chưa hoàn tất$/i, 'You have an incomplete $1 payment'],
      [/^Lần giao thứ (\d+)$/, 'Delivery attempt $1'],
      [/^Thanh toán trực tuyến qua (.+)$/i, 'Online payment via $1'],
      [/^Bạn xác nhận phụ trách đơn (.+)\.$/, 'Confirm that you will handle order $1.'],
      [/^Xác nhận phụ trách đơn (.+)\.$/, 'Confirm assignment for order $1.'],
      [/^Đã phân công đơn (.+)$/, 'Order $1 assigned'],
      [/^Phân công đơn (.+)$/, 'Assign order $1'],
      [/^Đơn (.+) sẽ quay lại hàng chờ điều phối\.$/, 'Order $1 will return to the dispatch queue.'],
      [/^Đơn (.+) sẽ quay lại trạng thái đang giao\.$/, 'Order $1 will return to Delivering.'],
      [
        /^Đơn (.+) chỉ chuyển sang Đã xác nhận sau thao tác này\.$/,
        'Order $1 will only move to Confirmed after this action.',
      ],
      [/^(\d+) tài khoản$/, '$1 accounts'],
      [/^(\d+) đơn hoàn tất$/, '$1 completed orders'],
      [/^\/ (\d+) tổng$/, '/ $1 total'],
      [/^([\d.,]+)đ$/, 'VND $1'],
      [/^(.+) sẽ không thể đăng nhập hoặc nhận đơn mới\.$/, '$1 will no longer be able to sign in or accept new jobs.'],
      [/^Đơn (.+) đã hoàn tất\.$/, 'Order $1 has been completed.'],
      [/^(.+), Việt Nam$/, '$1, Vietnam'],
    ];
    for (const [pattern, replacement] of dynamicRules) {
      if (pattern.test(text)) return `${leading}${text.replace(pattern, replacement)}${trailing}`;
    }
    return value;
  }

  private readInitialLanguage(): AppLanguage {
    if (!isPlatformBrowser(this.platformId)) return 'vi';
    try {
      return localStorage.getItem(this.storageKey) === 'en' ? 'en' : 'vi';
    } catch {
      return 'vi';
    }
  }

  private applyDocumentLanguage(language: AppLanguage) {
    this.document.documentElement.lang = language;
    this.document.documentElement.dir = 'ltr';
    this.document.documentElement.dataset['language'] = language;

    const english = language === 'en';
    const title = english
      ? 'AP Post — Fast delivery, effortless tracking'
      : 'AP Post — Giao hàng nhanh, theo dõi dễ dàng';
    const description = english
      ? 'Create shipments, estimate delivery fees, and track every journey online with AP Post.'
      : 'AP Post giúp tạo đơn, tính cước và theo dõi hành trình giao hàng trực tuyến.';
    this.document.title = title;
    this.setMetaContent('meta[name="description"]', description);
    this.setMetaContent('meta[property="og:locale"]', english ? 'en_US' : 'vi_VN');
    this.setMetaContent('meta[property="og:title"]', title);
    this.setMetaContent('meta[property="og:description"]', description);
  }

  private setMetaContent(selector: string, content: string): void {
    this.document.querySelector(selector)?.setAttribute('content', content);
  }

  private interpolate(
    value: string,
    parameters: Record<string, string | number> | undefined,
  ): string {
    if (!parameters) return value;
    return value.replace(/\{\{?\s*([\w-]+)\s*\}?\}/g, (match, key: string) =>
      Object.prototype.hasOwnProperty.call(parameters, key) ? String(parameters[key]) : match,
    );
  }
}
