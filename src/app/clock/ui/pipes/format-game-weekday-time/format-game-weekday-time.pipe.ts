import { Pipe, PipeTransform } from '@angular/core';

import { formatOptional } from '@app/shared/util/format';

import { formatGameWeekdayTime } from '../../../domain/game-time-format';
import { Tick } from '../../../domain/models/time.model';

/** Weekday and time of a tick, e.g. `Mo., 09:30`. */
@Pipe({ name: 'formatGameWeekdayTime' })
export class FormatGameWeekdayTimePipe implements PipeTransform {
  transform(tick: Tick | null | undefined): string {
    return formatOptional(tick, formatGameWeekdayTime);
  }
}
