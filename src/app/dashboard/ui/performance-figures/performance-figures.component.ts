import { Component, computed, input } from '@angular/core';

import { PerformanceFigures, PeriodReturns } from '@app/portfolio/domain/models/performance.model';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatSignedCentsPipe } from '@app/shared/ui/pipes/format-signed-cents/format-signed-cents.pipe';
import { FormatSignedPercentPipe } from '@app/shared/ui/pipes/format-signed-percent/format-signed-percent.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

interface ReturnRow {
  id: 'portfolio' | 'benchmark';
  label: string;
  returns: PeriodReturns;
}

/**
 * Performance and benchmark (US-PF-05, TS §7.9): the time-weighted return since the start, in the
 * running year and annualised („–“ before a full year) for the player and the benchmark, the
 * benchmark's value and the second comparison value, with a short explanation for beginners and a
 * note when days were left out of the chain.
 */
@Component({
  selector: 'app-performance-figures',
  imports: [
    PanelComponent,
    SkeletonComponent,
    FormatCentsPipe,
    FormatSignedCentsPipe,
    FormatSignedPercentPipe,
  ],
  templateUrl: './performance-figures.component.html',
  host: { class: 'block' },
})
export class PerformanceFiguresComponent {
  figures = input.required<PerformanceFigures | null>();

  rows = computed((): ReturnRow[] => {
    const figures = this.figures();
    if (figures === null) {
      return [];
    }
    const rows: ReturnRow[] = [
      { id: 'portfolio', label: this.portfolioLabel, returns: figures.returns },
    ];
    if (figures.benchmark !== null) {
      rows.push({
        id: 'benchmark',
        label: this.benchmarkLabel,
        returns: figures.benchmark.returns,
      });
    }
    return rows;
  });

  heading = $localize`:@@uiDashboard-performanceFigures-heading:Performance`;
  portfolioLabel = $localize`:@@uiDashboard-performanceFigures-portfolio:Ihr Vermögen`;
  benchmarkLabel = $localize`:@@uiDashboard-performanceFigures-benchmark:Benchmark`;
}
