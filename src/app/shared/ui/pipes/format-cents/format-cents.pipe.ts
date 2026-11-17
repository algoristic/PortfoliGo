import { Pipe, PipeTransform } from '@angular/core';

import { Cents } from '../../../domain/models/money.model';
import { formatCents, formatOptional } from '../../../util/format';

@Pipe({ name: 'formatCents' })
export class FormatCentsPipe implements PipeTransform {
  transform(cents: Cents | null | undefined, maxFractionDigits = 2): string {
    return formatOptional(cents, (value) => formatCents(value, maxFractionDigits));
  }
}
