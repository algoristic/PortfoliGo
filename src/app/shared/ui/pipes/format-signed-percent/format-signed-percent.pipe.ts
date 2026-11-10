import { Pipe, PipeTransform } from '@angular/core';

import { formatSignedPercent } from '../../../util/format';

@Pipe({ name: 'formatSignedPercent' })
export class FormatSignedPercentPipe implements PipeTransform {
  transform(ratio: number, fractionDigits?: number): string {
    return formatSignedPercent(ratio, fractionDigits);
  }
}
