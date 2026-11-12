import { Pipe, PipeTransform } from '@angular/core';

import { formatNumber, formatOptional } from '../../../util/format';

@Pipe({ name: 'formatNumber' })
export class FormatNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, fractionDigits?: number): string {
    return formatOptional(value, (finite) => formatNumber(finite, fractionDigits));
  }
}
