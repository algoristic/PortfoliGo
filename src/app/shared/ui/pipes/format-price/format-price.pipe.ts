import { Pipe, PipeTransform } from '@angular/core';

import { priceDecimals } from '../../../domain/price-step-logic';
import { formatPrice } from '../../../util/format';

/** Formats a price with the decimal places of its price grid. */
@Pipe({ name: 'formatPrice' })
export class FormatPricePipe implements PipeTransform {
  transform(price: number): string {
    return formatPrice(price, priceDecimals(price));
  }
}
