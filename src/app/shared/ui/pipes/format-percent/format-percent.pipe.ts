import { Pipe, PipeTransform } from '@angular/core';

import { formatPercent } from '../../../util/format';

@Pipe({ name: 'formatPercent' })
export class FormatPercentPipe implements PipeTransform {
  transform(ratio: number, fractionDigits?: number): string {
    return formatPercent(ratio, fractionDigits);
  }
}
