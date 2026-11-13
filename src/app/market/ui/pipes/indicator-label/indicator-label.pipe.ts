import { Pipe, PipeTransform } from '@angular/core';

import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';

import { indicatorLabel } from '../../labels/indicator-labels';

@Pipe({ name: 'indicatorLabel' })
export class IndicatorLabelPipe implements PipeTransform {
  transform(spec: IndicatorSpec): string {
    return indicatorLabel(spec);
  }
}
