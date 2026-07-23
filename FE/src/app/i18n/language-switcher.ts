import { Component, HostBinding } from '@angular/core';
import { Router } from '@angular/router';
import { LanguageService } from './language.service';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  template: `
    <div class="language-switcher" role="group" aria-label="Ngôn ngữ / Language">
      <button
        type="button"
        [class.active]="languageService.language() === 'vi'"
        (click)="languageService.setLanguage('vi')"
        aria-label="Tiếng Việt"
        [attr.aria-pressed]="languageService.language() === 'vi'"
      >
        VI
      </button>
      <button
        type="button"
        [class.active]="languageService.language() === 'en'"
        (click)="languageService.setLanguage('en')"
        aria-label="English"
        [attr.aria-pressed]="languageService.language() === 'en'"
      >
        EN
      </button>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      z-index: 1035;
      bottom: max(18px, env(safe-area-inset-bottom));
      left: max(18px, env(safe-area-inset-left));
    }
    .language-switcher {
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding: 4px;
      border: 1px solid rgba(14, 15, 12, 0.14);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 10px 30px rgba(14, 15, 12, 0.14);
      backdrop-filter: blur(16px);
    }
    button {
      min-width: 44px;
      min-height: 44px;
      padding: 0 9px;
      border: 0;
      border-radius: 999px;
      color: #5f625d;
      background: transparent;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      touch-action: manipulation;
    }
    button:focus-visible {
      outline: 3px solid #9fe870;
      outline-offset: 3px;
    }
    button.active {
      color: #163300;
      background: #9fe870;
    }
    @media (max-width: 767px) {
      :host {
        bottom: calc(88px + env(safe-area-inset-bottom));
        left: 12px;
      }
      :host.shipper-mode {
        top: max(10px, env(safe-area-inset-top));
        right: max(70px, env(safe-area-inset-right));
        bottom: auto;
        left: auto;
        z-index: 45;
      }
      :host.shipper-mode .language-switcher {
        padding: 2px;
        box-shadow: none;
      }
    }
    @media (min-width: 768px) and (max-width: 991px) {
      :host.shipper-mode {
        top: max(10px, env(safe-area-inset-top));
        right: auto;
        bottom: auto;
        left: 50%;
        z-index: 45;
        transform: translateX(-50%);
      }
    }
  `,
})
export class LanguageSwitcher {
  constructor(
    readonly languageService: LanguageService,
    private readonly router: Router,
  ) {}

  @HostBinding('class.shipper-mode')
  get shipperMode(): boolean {
    return this.router.url.startsWith('/shipper');
  }
}
