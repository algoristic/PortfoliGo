import { Component, computed, input } from '@angular/core';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { formatNumber, formatOptional, formatPercent } from '@app/shared/util/format';

import { IntradayRowView, ProfileBar } from './intraday-statistics.model';

import { IntradayMeasures, IntradayStatistics } from '../../domain/models/lab-statistics.model';

const MS_PER_SECOND = 1000;

/**
 * Intraday statistics of the lab (TS §6.9, §14.2): minute volatility, daily range and session
 * volatility from the bridges against the minute-by-minute reference, the intraday profile and
 * the throughput of the minute curves.
 */
@Component({
  selector: 'app-intraday-statistics',
  imports: [
    TableHeadDirective,
    TableCellDirective,
    TableDirective,
    FormatGameDatePipe,
    FormatNumberPipe,
  ],
  templateUrl: './intraday-statistics.component.html',
  host: { class: 'block' },
})
export class IntradayStatisticsComponent {
  statistics = input.required<IntradayStatistics>();

  rows = computed<IntradayRowView[]>(() => {
    const { stocks, worldIndex, reference } = this.statistics();
    const row = (
      id: keyof IntradayMeasures,
      label: string,
      fractionDigits: number,
    ): IntradayRowView => {
      const text = (value: number | undefined): string =>
        formatOptional(value, (finite) => formatPercent(finite, fractionDigits));
      return {
        id,
        label,
        stocks: text(stocks[id]),
        worldIndex: id === 'sessionVolatility' ? '' : text(worldIndex[id]),
        bridge: text(reference.bridge[id]),
        reference: text(reference.reference[id]),
      };
    };
    return [
      row('minuteVolatility', this.minuteVolatilityLabel, 1),
      row('dailyRange', this.dailyRangeLabel, 2),
      row('sessionVolatility', this.sessionVolatilityLabel, 1),
    ];
  });
  bars = computed<ProfileBar[]>(() => {
    const profile = this.statistics().profile;
    const highest = Math.max(...profile.filter(Number.isFinite), 1);
    return profile.map((value, part) => ({
      part,
      value,
      height: Number.isFinite(value) ? (value / highest) * 100 : 0,
      title: `${part + 1}: ${formatOptional(value, (finite) => formatNumber(finite, 2))}`,
    }));
  });
  marketDaysPerSecond = computed(() => {
    const { marketDays, curvesMs } = this.statistics();
    return curvesMs > 0 ? (marketDays * MS_PER_SECOND) / curvesMs : Number.NaN;
  });

  minuteVolatilityLabel = $localize`:@@uiLab-intradayStatistics-minuteVolatility:Volatilität der Minutenrenditen p. a.`;
  dailyRangeLabel = $localize`:@@uiLab-intradayStatistics-dailyRange:Tagesspanne (Hoch − Tief) ÷ Eröffnung`;
  sessionVolatilityLabel = $localize`:@@uiLab-intradayStatistics-sessionVolatility:Volatilität Eröffnung → Schluss p. a.`;
}
