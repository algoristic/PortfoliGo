import { Pipe, PipeTransform } from '@angular/core';

import { formatCompact, formatOptional } from '../../../util/format';

@Pipe({ name: 'formatCompact' })
export class FormatCompactPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatOptional(value, formatCompact);
  }
}
