import { Pipe, PipeTransform } from '@angular/core';

import { formatCompact } from '../../../util/format';

@Pipe({ name: 'formatCompact' })
export class FormatCompactPipe implements PipeTransform {
  transform(value: number): string {
    return formatCompact(value);
  }
}
