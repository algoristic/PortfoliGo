import { Pipe, PipeTransform } from '@angular/core';

import { MicroUnits } from '../../../domain/models/money.model';
import { formatOptional, formatQuantity } from '../../../util/format';

/** Formats a number of shares in millionths with the decimal places it needs (`formatQuantity`). */
@Pipe({ name: 'formatQuantity' })
export class FormatQuantityPipe implements PipeTransform {
  transform(quantity: MicroUnits | null | undefined): string {
    return formatOptional(quantity, formatQuantity);
  }
}
