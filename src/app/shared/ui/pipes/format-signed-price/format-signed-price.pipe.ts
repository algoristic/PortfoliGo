import { Pipe, PipeTransform } from '@angular/core';

import { formatOptional, formatSignedPrice } from '../../../util/format';

/** A price change with sign and the decimal places of its price, e.g. `+0,125 €`. */
@Pipe({ name: 'formatSignedPrice' })
export class FormatSignedPricePipe implements PipeTransform {
  transform(change: number | null | undefined, fractionDigits = 2): string {
    return formatOptional(change, (value) => formatSignedPrice(value, fractionDigits));
  }
}
