import { Pipe, PipeTransform } from '@angular/core';

import { priceDecimals } from '../../../domain/price-step-logic';
import { formatOptional, formatPrice } from '../../../util/format';

/** Formats a price with the decimal places of its price grid. */
@Pipe({ name: 'formatPrice' })
export class FormatPricePipe implements PipeTransform {
  transform(price: number | null | undefined): string {
    return formatOptional(price, (value) => formatPrice(value, priceDecimals(value)));
  }
}
