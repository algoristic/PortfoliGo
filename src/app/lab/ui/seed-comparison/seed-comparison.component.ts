import { Component, computed, input, output } from '@angular/core';

import { median } from '@app/analysis/domain/statistics-logic';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { formatOptional, formatPercent } from '@app/shared/util/format';

import { SeedColumn, SeedRowView } from './seed-comparison.model';

import {
  LongTermCheckpoint,
  RollingWindows,
  SeedRun,
} from '../../domain/models/lab-statistics.model';

interface ColumnDefinition extends SeedColumn {
  value: (run: SeedRun) => number;
}

/**
 * Seed comparison of the lab (TS §14.2): long runs of several seeds side by side, so that the
 * long-term behaviour (E-22) and the rolling windows don't hang on one world.
 */
@Component({
  selector: 'app-seed-comparison',
  imports: [ButtonDirective, FormatNumberPipe, SkeletonComponent],
  templateUrl: './seed-comparison.component.html',
  host: { class: 'block' },
})
export class SeedComparisonComponent {
  runs = input.required<SeedRun[]>();
  seeds = input.required<readonly string[]>();
  years = input.required<number>();
  running = input(false);
  disabled = input(false);
  /** Total duration of the runs in the worker. */
  durationMs = input<number>();

  clickedCompare = output<void>();

  #columns: ColumnDefinition[] = [
    {
      id: 'return-10',
      label: $localize`:@@uiLab-seedComparison-return10:Rendite (10 J.)`,
      value: (run) => windowOf(run, 10)?.totalReturn.median ?? Number.NaN,
    },
    {
      id: 'volatility-10',
      label: $localize`:@@uiLab-seedComparison-volatility10:Volatilität (10 J.)`,
      value: (run) => windowOf(run, 10)?.volatility.median ?? Number.NaN,
    },
    {
      id: 'dividend-yield-10',
      label: $localize`:@@uiLab-seedComparison-dividendYield10:Dividendenrendite (10 J.)`,
      value: (run) => windowOf(run, 10)?.dividendYield.median ?? Number.NaN,
    },
    {
      id: 'return-30',
      label: $localize`:@@uiLab-seedComparison-return30:Rendite (30 J.)`,
      value: (run) => windowOf(run, 30)?.totalReturn.median ?? Number.NaN,
    },
    {
      id: 'volatility-30',
      label: $localize`:@@uiLab-seedComparison-volatility30:Volatilität (30 J.)`,
      value: (run) => windowOf(run, 30)?.volatility.median ?? Number.NaN,
    },
    {
      id: 'top-five-50',
      label: $localize`:@@uiLab-seedComparison-topFive50:Top 5 (+50 J.)`,
      value: (run) => checkpointOf(run, 50)?.topFiveShare ?? Number.NaN,
    },
    {
      id: 'top-five-100',
      label: $localize`:@@uiLab-seedComparison-topFive100:Top 5 (+100 J.)`,
      value: (run) => checkpointOf(run, 100)?.topFiveShare ?? Number.NaN,
    },
    {
      id: 'below-one-euro-100',
      label: $localize`:@@uiLab-seedComparison-belowOneEuro100:Unter 1 € (+100 J.)`,
      value: (run) => checkpointOf(run, 100)?.belowOneEuro.all ?? Number.NaN,
    },
    {
      id: 'at-floor-100',
      label: $localize`:@@uiLab-seedComparison-atFloor100:Untergrenze (+100 J.)`,
      value: (run) => checkpointOf(run, 100)?.atFloor ?? Number.NaN,
    },
    {
      id: 'crisis-share',
      label: $localize`:@@uiLab-seedComparison-crisisShare:Krisenanteil`,
      value: (run) =>
        run.phaseShares.find((share) => share.phase === 'crisis')?.share ?? Number.NaN,
    },
  ];

  columns: SeedColumn[] = this.#columns.map(({ id, label }) => ({ id, label }));
  progress = computed(() => `${this.runs().length} / ${this.seeds().length}`);
  rows = computed<SeedRowView[]>(() => {
    const runs = this.runs();
    const rows: SeedRowView[] = runs.map((run) => ({
      key: run.seed,
      label: run.seed,
      cells: this.#columns.map(({ id, value }) => ({ id, text: percent(value(run)) })),
    }));
    if (runs.length > 1) {
      rows.push({
        key: 'median',
        label: this.medianLabel,
        cells: this.#columns.map(({ id, value }) => ({
          id,
          text: percent(median(runs.map(value))),
        })),
      });
    }
    return rows;
  });

  medianLabel = $localize`:@@uiLab-seedComparison-median:Median`;

  onCompare(): void {
    this.clickedCompare.emit();
  }
}

function windowOf(run: SeedRun, years: number): RollingWindows | undefined {
  return run.longTerm.windows.find((entry) => entry.years === years);
}

function checkpointOf(run: SeedRun, years: number): LongTermCheckpoint | undefined {
  return run.longTerm.checkpoints.find((entry) => entry.years === years);
}

function percent(value: number): string {
  return formatOptional(value, (finite) => formatPercent(finite, 1));
}
