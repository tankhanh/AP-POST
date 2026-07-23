import { AfterViewInit, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageSwitcher } from './i18n/language-switcher';
import { DomI18nService } from './i18n/dom-i18n.service';
import { PaymentRecoveryBanner } from './shared/payment-recovery-banner/payment-recovery-banner';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LanguageSwitcher, PaymentRecoveryBanner],
  templateUrl: './app.html',
})
export class App implements AfterViewInit {
  constructor(private readonly domI18n: DomI18nService) {}

  ngAfterViewInit(): void {
    this.domI18n.start();
  }
}
