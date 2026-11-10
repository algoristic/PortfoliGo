import { Pipe, PipeTransform } from '@angular/core';

import { Cents } from '../../../domain/models/money.model';
import { formatCents } from '../../../util/format';

@Pipe({ name: 'formatCents' })
export class FormatCentsPipe implements PipeTransform {
  transform(cents: Cents): string {
    return formatCents(cents);
  }
}
