import { Directive, ElementRef, forwardRef, HostListener, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({
  selector: 'input[apCurrencyInput]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyInputDirective),
      multi: true,
    },
  ],
  host: {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    class: 'ap-currency-input',
  },
})
export class CurrencyInputDirective implements ControlValueAccessor {
  @Input() currencyMax = 1_000_000_000;

  private value: number | null = null;
  private disabled = false;
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly element: ElementRef<HTMLInputElement>) {}

  writeValue(value: number | string | null | undefined): void {
    const parsed = this.toNumber(value);
    this.value = parsed;
    this.element.nativeElement.value = this.format(parsed);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    this.element.nativeElement.disabled = disabled;
  }

  @HostListener('input', ['$event'])
  handleInput(event: Event): void {
    if (this.disabled) return;
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 13);
    const parsed = digits ? Math.min(Number(digits), this.currencyMax) : null;
    this.value = Number.isFinite(parsed) ? parsed : null;
    input.value = this.format(this.value);
    input.setSelectionRange(input.value.length, input.value.length);
    this.onChange(this.value);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
    this.element.nativeElement.value = this.format(this.value);
  }

  @HostListener('keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (['e', 'E', '+', '-', '.', ','].includes(event.key)) event.preventDefault();
  }

  private toNumber(value: number | string | null | undefined): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(String(value).replace(/\D/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.min(Math.round(parsed), this.currencyMax);
  }

  private format(value: number | null): string {
    return value === null ? '' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
  }
}
