import { Component, input } from '@angular/core';

import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';

import { CorrelationMatrix } from '../../domain/models/lab-statistics.model';

/** Mean correlations of daily returns per sector pair (shares of the same region). */
@Component({
  selector: 'app-correlation-matrix',
  imports: [FormatNumberPipe],
  templateUrl: './correlation-matrix.component.html',
  host: { class: 'block' },
})
export class CorrelationMatrixComponent {
  matrix = input.required<CorrelationMatrix>();
}
