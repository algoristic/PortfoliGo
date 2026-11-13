import { Pipe, PipeTransform } from '@angular/core';

import { Cents } from '../../../domain/models/money.model';
import { formatOptional, formatSignedCents } from '../../../util/format';

/** An amount of change with sign and a typographic minus, e.g. `+312,40 €`, `−45,10 €`. */
@Pipe({ name: 'formatSignedCents' })
export class FormatSignedCentsPipe implements PipeTransform {
  transform(cents: Cents | null | undefined): string {
    return formatOptional(cents, formatSignedCents);
  }
}
