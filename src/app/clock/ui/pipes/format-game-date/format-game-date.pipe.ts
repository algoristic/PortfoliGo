import { Pipe, PipeTransform } from '@angular/core';

import { formatOptional } from '@app/shared/util/format';

import { formatGameDate } from '../../../domain/game-time-format';
import { Tick } from '../../../domain/models/time.model';

/** Date of a tick, e.g. `01.04.2030`. */
@Pipe({ name: 'formatGameDate' })
export class FormatGameDatePipe implements PipeTransform {
  transform(tick: Tick | null | undefined): string {
    return formatOptional(tick, formatGameDate);
  }
}
