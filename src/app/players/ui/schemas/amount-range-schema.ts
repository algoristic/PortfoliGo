import { required, schema, Schema, validate } from '@angular/forms/signals';

import { AmountRange } from '@app/players/domain/player-limits';
import { amountRangeError } from '@app/players/domain/player-logic';
import { Cents } from '@app/shared/domain/models/money.model';
import { formatAmountInput } from '@app/shared/util/amount-input';

/** An amount field (`app-amount-input`) that must be filled and lie within `range`. */
export function amountRangeSchema(range: AmountRange): Schema<Cents | null> {
  return schema<Cents | null>((path) => {
    required(path, {
      message: $localize`:@@uiPlayers-amountRangeSchema-required:Bitte gib einen Betrag ein.`,
    });
    validate(path, ({ value }) => {
      const min = formatAmountInput(range.min);
      const max = formatAmountInput(range.max);
      switch (value() === null ? null : amountRangeError(value(), range)) {
        case 'too-small':
          return {
            kind: 'too-small',
            message: $localize`:@@uiPlayers-amountRangeSchema-tooSmall:Der Betrag muss mindestens ${min}:min: € sein.`,
          };
        case 'too-large':
          return {
            kind: 'too-large',
            message: $localize`:@@uiPlayers-amountRangeSchema-tooLarge:Der Betrag darf höchstens ${max}:max: € sein.`,
          };
        case 'not-whole-cents':
          return {
            kind: 'not-whole-cents',
            message: $localize`:@@uiPlayers-amountRangeSchema-notWholeCents:Bitte gib den Betrag auf den Cent genau ein.`,
          };
        default:
          return null;
      }
    });
  });
}
