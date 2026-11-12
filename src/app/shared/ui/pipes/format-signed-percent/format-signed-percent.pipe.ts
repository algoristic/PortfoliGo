import { Pipe, PipeTransform } from '@angular/core';

import { formatOptional, formatSignedPercent } from '../../../util/format';

@Pipe({ name: 'formatSignedPercent' })
export class FormatSignedPercentPipe implements PipeTransform {
  transform(ratio: number | null | undefined, fractionDigits?: number): string {
    return formatOptional(ratio, (value) => formatSignedPercent(value, fractionDigits));
  }
}
