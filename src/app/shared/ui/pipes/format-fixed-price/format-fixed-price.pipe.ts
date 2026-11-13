import { Pipe, PipeTransform } from '@angular/core';

import { formatOptional, formatPrice } from '../../../util/format';

/**
 * An amount in euros with the decimal places of another price, e.g. the spread with those of the
 * quote (`formatPrice` would choose them by the amount itself).
 */
@Pipe({ name: 'formatFixedPrice' })
export class FormatFixedPricePipe implements PipeTransform {
  transform(price: number | null | undefined, fractionDigits = 2): string {
    return formatOptional(price, (value) => formatPrice(value, fractionDigits));
  }
}
