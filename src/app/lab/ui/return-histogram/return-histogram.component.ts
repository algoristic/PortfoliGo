import { Component, computed, input } from '@angular/core';

import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { formatNumber, formatOptional } from '@app/shared/util/format';

import { HistogramBar } from './return-histogram.model';

import { ReturnDistribution } from '../../domain/models/lab-statistics.model';

/** Distribution of the standardized daily returns against a normal distribution. */
@Component({
  selector: 'app-return-histogram',
  imports: [FormatNumberPipe],
  templateUrl: './return-histogram.component.html',
  host: { class: 'block' },
})
export class ReturnHistogramComponent {
  distribution = input.required<ReturnDistribution>();

  bars = computed<HistogramBar[]>(() => {
    const { counts, normal, min, binWidth } = this.distribution();
    const highest = Math.max(1, ...counts, ...normal);
    return counts.map((count, bin) => {
      const center = min + (bin + 0.5) * binWidth;
      return {
        center,
        count,
        height: (count / highest) * 100,
        normalHeight: (normal[bin] / highest) * 100,
        title: `${formatOptional(center, (value) => formatNumber(value, 2))} σ: ${count}`,
      };
    });
  });
}
