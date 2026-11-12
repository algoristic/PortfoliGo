import { Pipe, PipeTransform } from '@angular/core';

import { formatOptional, formatPercent } from '../../../util/format';

@Pipe({ name: 'formatPercent' })
export class FormatPercentPipe implements PipeTransform {
  transform(ratio: number | null | undefined, fractionDigits?: number): string {
    return formatOptional(ratio, (value) => formatPercent(value, fractionDigits));
  }
}
