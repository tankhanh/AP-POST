import { Pipe, PipeTransform } from '@angular/core';
import { LanguageService } from './language.service';

@Pipe({
  name: 'translate',
  standalone: true,
  // The active language is a signal, while the source text normally stays unchanged.
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  constructor(private readonly languageService: LanguageService) {}

  transform(value: string | null | undefined, parameters?: Record<string, string | number>): string {
    return value ? this.languageService.t(value, parameters) : '';
  }
}
