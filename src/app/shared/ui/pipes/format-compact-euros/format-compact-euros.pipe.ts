import { Pipe, PipeTransform } from '@angular/core';

import { formatCompactEuros, formatOptional } from '../../../util/format';

/** Large amounts of euros in short form, e.g. `1,2 Mrd. €`. */
@Pipe({ name: 'formatCompactEuros' })
export class FormatCompactEurosPipe implements PipeTransform {
  transform(euros: number | null | undefined): string {
    return formatOptional(euros, formatCompactEuros);
  }
}
