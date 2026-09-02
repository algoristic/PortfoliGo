import { ValidationErrors, ValidatorFn } from '@angular/forms';

import { maskitoParseNumber } from '@maskito/kit';

import { CurrencyConfig } from './currency.config';

export class CurrencyValidators {
  static currencyRange(min: number, max: number, config: CurrencyConfig): ValidatorFn {
    return (control): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }

      const value = maskitoParseNumber(String(control.value), config);

      if (!Number.isFinite(value)) {
        return { number: { actual: control.value } };
      }

      if (value < min) {
        return { min: { min, actual: value } };
      }

      return value > max ? { max: { max, actual: value } } : null;
    };
  }
}
