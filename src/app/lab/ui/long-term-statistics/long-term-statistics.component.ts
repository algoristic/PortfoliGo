import { Component, computed, input } from '@angular/core';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { formatOptional, formatPercent, formatPrice, MISSING_VALUE } from '@app/shared/util/format';

import { CheckpointColumn, CheckpointRowView, WindowRowView } from './long-term-statistics.model';

import {
  limitAt,
  LONG_TERM_LIMIT_YEARS,
  LONG_TERM_LIMITS,
  LongTermLimit,
} from '../../domain/calibration-targets';
import {
  LongTermCheckpoint,
  LongTermStatistics,
  RollingWindows,
  WindowRange,
} from '../../domain/models/lab-statistics.model';

type CheckpointMeasure = (checkpoint: LongTermCheckpoint) => number;
type WindowMeasure = 'totalReturn' | 'volatility' | 'dividendYield';

/** Long-term behaviour of the market (TS §6.9, E-22): checkpoints and rolling windows. */
@Component({
  selector: 'app-long-term-statistics',
  imports: [TableHeadDirective, TableCellDirective, TableDirective, FormatGameDatePipe],
  templateUrl: './long-term-statistics.component.html',
  host: { class: 'block' },
})
export class LongTermStatisticsComponent {
  statistics = input.required<LongTermStatistics>();

  columns = computed<CheckpointColumn[]>(() =>
    this.statistics().checkpoints.map(({ years, tick }) => ({ years, tick })),
  );
  missingCheckpoints = computed(() =>
    this.statistics().checkpoints.some((checkpoint) => checkpoint.tick === null),
  );
  checkpointRows = computed<CheckpointRowView[]>(() => {
    const checkpoints = this.statistics().checkpoints;
    const percent = (value: number): string =>
      formatOptional(value, (finite) => formatPercent(finite, 1));
    const row = (
      id: string,
      label: string,
      measure: CheckpointMeasure,
      format: (value: number) => string = percent,
      limit?: LongTermLimit,
    ): CheckpointRowView => ({
      id,
      label,
      values: checkpoints.map((checkpoint) => ({
        years: checkpoint.years,
        text: format(measure(checkpoint)),
      })),
      limit: checkpointLimitText(limit),
    });
    return [
      row(
        'top-five',
        this.labels.topFive,
        (c) => c.topFiveShare,
        percent,
        LONG_TERM_LIMITS.topFiveShare,
      ),
      row(
        'below-one-euro',
        this.labels.belowOneEuro,
        (c) => c.belowOneEuro.all,
        percent,
        LONG_TERM_LIMITS.belowOneEuro,
      ),
      row('below-one-euro-large', this.labels.belowOneEuroLarge, (c) => c.belowOneEuro.large),
      row('below-one-euro-mid', this.labels.belowOneEuroMid, (c) => c.belowOneEuro.mid),
      row('below-one-euro-small', this.labels.belowOneEuroSmall, (c) => c.belowOneEuro.small),
      row('at-floor', this.labels.atFloor, (c) => c.atFloor, percent, LONG_TERM_LIMITS.atFloor),
      row(
        'max-price',
        this.labels.maxPrice,
        (c) => c.maxPrice,
        (value) => formatOptional(value, (finite) => formatPrice(finite)),
      ),
      row('index-volatility', this.labels.indexVolatility, (c) => c.indexVolatility),
    ];
  });
  windowRows = computed<WindowRowView[]>(() =>
    this.statistics().windows.flatMap((windows) => [
      this.#windowRow(windows, 'totalReturn', 'total-return', this.labels.windowReturn),
      this.#windowRow(windows, 'volatility', 'volatility', this.labels.windowVolatility),
      this.#windowRow(windows, 'dividendYield', 'dividend-yield', this.labels.windowDividendYield),
    ]),
  );

  labels = {
    topFive: $localize`:@@uiLab-longTermStatistics-topFive:Anteil der fünf größten Werte am Weltindex`,
    belowOneEuro: $localize`:@@uiLab-longTermStatistics-belowOneEuro:Aktien unter 1 € (alle)`,
    belowOneEuroLarge: $localize`:@@uiLab-longTermStatistics-belowOneEuroLarge:Large Caps unter 1 €`,
    belowOneEuroMid: $localize`:@@uiLab-longTermStatistics-belowOneEuroMid:Mid Caps unter 1 €`,
    belowOneEuroSmall: $localize`:@@uiLab-longTermStatistics-belowOneEuroSmall:Small Caps unter 1 €`,
    atFloor: $localize`:@@uiLab-longTermStatistics-atFloor:Aktien an der Kursuntergrenze`,
    maxPrice: $localize`:@@uiLab-longTermStatistics-maxPrice:Höchster Aktienkurs`,
    indexVolatility: $localize`:@@uiLab-longTermStatistics-indexVolatility:Weltindex, Volatilität der letzten 261 Tage`,
    windowReturn: $localize`:@@uiLab-longTermStatistics-windowReturn:Weltindex (Performance), Rendite p. a.`,
    windowVolatility: $localize`:@@uiLab-longTermStatistics-windowVolatility:Weltindex, Volatilität p. a.`,
    windowDividendYield: $localize`:@@uiLab-longTermStatistics-windowDividendYield:Weltindex, Dividendenrendite p. a.`,
  };

  #windowRow(
    windows: RollingWindows,
    measure: WindowMeasure,
    id: string,
    label: string,
  ): WindowRowView {
    const range: WindowRange = windows[measure];
    const text = (value: number): string =>
      formatOptional(value, (finite) => formatPercent(finite, 1));
    const limits: Partial<Record<WindowMeasure, LongTermLimit>> = {
      volatility: LONG_TERM_LIMITS.windowVolatility,
      dividendYield: LONG_TERM_LIMITS.windowDividendYield,
    };
    const limit = limits[measure];
    return {
      id,
      years: windows.years,
      label,
      count: windows.count,
      min: text(range.min),
      median: text(range.median),
      max: text(range.max),
      limit: limitText(limit?.years === windows.years ? limit : undefined),
    };
  }
}

/**
 * Limits at the checkpoints of `LONG_TERM_LIMIT_YEARS`: one text when they are equal, else one per
 * checkpoint, „≤ 45,0 % / ≤ 65,0 % / ≤ 65,0 %“.
 */
function checkpointLimitText(limit: LongTermLimit | undefined): string {
  if (limit === undefined) {
    return MISSING_VALUE;
  }
  const texts = LONG_TERM_LIMIT_YEARS.map((years) => limitText(limitAt(limit, years)));
  return texts.every((text) => text === texts[0]) ? texts[0] : texts.join(' / ');
}

/** „≤ 40,0 %“, „≥ 1,5 %“ or „13,0 % – 20,0 %“; `–` without a limit. */
function limitText(limit: LongTermLimit | undefined): string {
  if (limit?.min !== undefined && limit.max !== undefined) {
    return `${formatPercent(limit.min, 1)} – ${formatPercent(limit.max, 1)}`;
  }
  if (limit?.max !== undefined) {
    return `≤ ${formatPercent(limit.max, 1)}`;
  }
  if (limit?.min !== undefined) {
    return `≥ ${formatPercent(limit.min, 1)}`;
  }
  return MISSING_VALUE;
}
