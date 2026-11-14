import { Pipe, PipeTransform } from '@angular/core';

import { formatBytes, formatOptional } from '../../../util/format';

@Pipe({ name: 'formatBytes' })
export class FormatBytesPipe implements PipeTransform {
  transform(bytes: number | null | undefined): string {
    return formatOptional(bytes, formatBytes);
  }
}
