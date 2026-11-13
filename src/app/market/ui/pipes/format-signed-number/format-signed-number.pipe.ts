import { Pipe, PipeTransform } from '@angular/core';

import { changeDirection } from '@app/shared/util/change-direction';
import { formatNumber, formatOptional } from '@app/shared/util/format';

const MINUS_SIGN = '−';

/**
 * A change in points (index levels) with sign and typographic minus (PS §10.4), e.g. `+12,34`,
 * `−0,50`; a change that rounds to zero has no sign.
 */
@Pipe({ name: 'formatSignedNumber' })
export class FormatSignedNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, fractionDigits = 2): string {
    return formatOptional(value, (finite) => {
      const text = formatNumber(Math.abs(finite), fractionDigits);
      switch (changeDirection(finite, fractionDigits)) {
        case 'up':
          return `+${text}`;
        case 'down':
          return `${MINUS_SIGN}${text}`;
        case 'flat':
          return text;
      }
    });
  }
}
