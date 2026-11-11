import { Component, input } from '@angular/core';

import { formatNumber } from '../../../shared/util/format';
import { CorrelationMatrix } from '../../domain/models/lab-statistics.model';

/** Mean correlations of daily returns per sector pair (shares of the same region). */
@Component({
  selector: 'app-section-correlation-matrix',
  imports: [],
  templateUrl: './section-correlation-matrix.component.html',
  styleUrl: './section-correlation-matrix.component.scss',
})
export class SectionCorrelationMatrixComponent {
  matrix = input.required<CorrelationMatrix>();

  formatCorrelation(value: number): string {
    return Number.isNaN(value) ? '–' : formatNumber(value, 2);
  }
}
