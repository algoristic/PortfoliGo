import { Component, computed, input } from '@angular/core';

import { formatNumber } from '../../../shared/util/format';
import { ReturnDistribution } from '../../domain/models/lab-statistics.model';

interface HistogramBar {
  center: number;
  count: number;
  height: number;
  normalHeight: number;
}

/** Distribution of the standardized daily returns against a normal distribution. */
@Component({
  selector: 'app-section-return-histogram',
  imports: [],
  templateUrl: './section-return-histogram.component.html',
  styleUrl: './section-return-histogram.component.scss',
})
export class SectionReturnHistogramComponent {
  distribution = input.required<ReturnDistribution>();

  bars = computed<HistogramBar[]>(() => {
    const { counts, normal, min, binWidth } = this.distribution();
    const highest = Math.max(1, ...counts, ...normal);
    return counts.map((count, bin) => ({
      center: min + (bin + 0.5) * binWidth,
      count,
      height: (count / highest) * 100,
      normalHeight: (normal[bin] / highest) * 100,
    }));
  });

  formatNumber(value: number, fractionDigits = 2): string {
    return Number.isFinite(value) ? formatNumber(value, fractionDigits) : '–';
  }
}
