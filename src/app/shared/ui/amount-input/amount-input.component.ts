import { Component, ElementRef, input, model, output, viewChild } from '@angular/core';
import { FormValueControl, transformedValue } from '@angular/forms/signals';

import { Cents } from '@app/shared/domain/models/money.model';
import { formatAmountInput, parseAmountInput } from '@app/shared/util/amount-input';

/**
 * Amount in euros with German number format (TS §11.8), bound with `[formField]` to a field of
 * `Cents | null`. An empty input is `null` (a `required` rule rejects it); text that is no amount
 * reports the parse error `amount` to the field and leaves the value unchanged. The caller names
 * the input: `<label [for]="inputId">` or `ariaLabel`, and links hints with `describedBy`.
 */
@Component({
  selector: 'app-amount-input',
  templateUrl: './amount-input.component.html',
  host: { class: 'block' },
})
export class AmountInputComponent implements FormValueControl<Cents | null> {
  value = model<Cents | null>(null);
  inputId = input<string>();
  ariaLabel = input<string>();
  /** IDs of the elements that describe the input (errors, hints). */
  describedBy = input<string>();
  testId = input('amount-input');
  disabled = input(false);
  invalid = input(false);
  touched = input(false);
  required = input(false);
  name = input('');

  touch = output<void>();

  inputElement = viewChild.required<ElementRef<HTMLInputElement>>('input');

  rawValue = transformedValue(this.value, {
    parse: (text: string) => {
      const result = parseAmountInput(text);
      switch (result.kind) {
        case 'empty':
          return { value: null };
        case 'amount':
          return { value: result.cents };
        default:
          return {
            error: {
              kind: 'amount',
              message: $localize`:@@uiShared-amountInput-parseError:Bitte gib einen Betrag ein, z. B. 1.234,56.`,
            },
          };
      }
    },
    format: (cents: Cents | null) => (cents === null ? '' : formatAmountInput(cents)),
  });

  focus(options?: FocusOptions): void {
    this.inputElement().nativeElement.focus(options);
  }

  onInput(event: Event): void {
    this.rawValue.set((event.target as HTMLInputElement).value);
  }

  onBlur(): void {
    if (this.rawValue.parseErrors().length === 0) {
      const cents = this.value();
      this.rawValue.set(cents === null ? '' : formatAmountInput(cents));
    }
    this.touch.emit();
  }
}
