import { Pipe, PipeTransform } from '@angular/core';

import { formatOptional } from '@app/shared/util/format';

import { formatGameTime } from '../../../domain/game-time-format';
import { Tick } from '../../../domain/models/time.model';

/** Weekday, date and time of a tick, e.g. `Mo., 01.04.2030, 09:30`. */
@Pipe({ name: 'formatGameTime' })
export class FormatGameTimePipe implements PipeTransform {
  transform(tick: Tick | null | undefined): string {
    return formatOptional(tick, formatGameTime);
  }
}
