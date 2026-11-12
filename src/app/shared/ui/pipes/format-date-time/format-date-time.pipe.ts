import { Pipe, PipeTransform } from '@angular/core';

import { formatDateTime, formatOptional } from '../../../util/format';

/** Local date and time of a wall-clock instant in ms, e.g. `12.11.2026, 14:30`. */
@Pipe({ name: 'formatDateTime' })
export class FormatDateTimePipe implements PipeTransform {
  transform(epochMs: number | null | undefined): string {
    return formatOptional(epochMs, formatDateTime);
  }
}
