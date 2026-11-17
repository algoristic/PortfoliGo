import { Component, computed, input, output } from '@angular/core';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { BadgeTone } from '@app/shared/ui/badge/badge.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableHeadDirective } from '@app/shared/ui/table/table-head.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { formatNumber, formatOptional, formatPercent } from '@app/shared/util/format';
import { SizeClass } from '@app/world/domain/models/taxonomy.model';

import { TargetRowView } from './market-statistics.model';

import { CalibrationTargetId } from '../../domain/calibration-targets';
import {
  LabStatistics,
  STATISTICS_STARTS,
  StatisticsStart,
  TargetRow,
  TargetStatus,
  TargetUnit,
} from '../../domain/models/lab-statistics.model';

import { CorrelationMatrixComponent } from '../correlation-matrix/correlation-matrix.component';
import { IntradayStatisticsComponent } from '../intraday-statistics/intraday-statistics.component';
import { LongTermStatisticsComponent } from '../long-term-statistics/long-term-statistics.component';
import { PhaseTimelineComponent } from '../phase-timeline/phase-timeline.component';
import { ReturnHistogramComponent } from '../return-histogram/return-histogram.component';

const STATUS_TONES: Record<TargetStatus, BadgeTone> = {
  ok: 'up',
  off: 'down',
  short: 'warning',
  info: 'neutral',
};

/** Statistics of the lab against the calibration targets (TS §6.9, §14.2). */
@Component({
  selector: 'app-market-statistics',
  imports: [
    TableHeadDirective,
    TableCellDirective,
    TableDirective,
    BadgeComponent,
    ButtonDirective,
    CorrelationMatrixComponent,
    FormatGameDatePipe,
    FormatNumberPipe,
    FormatPercentPipe,
    IntradayStatisticsComponent,
    LongTermStatisticsComponent,
    PhaseTimelineComponent,
    ReturnHistogramComponent,
    SkeletonComponent,
  ],
  templateUrl: './market-statistics.component.html',
  host: { class: 'block' },
})
export class MarketStatisticsComponent {
  statistics = input<LabStatistics>();
  start = input.required<StatisticsStart>();
  loading = input(false);
  disabled = input(false);
  /** Duration of the last computation in the worker. */
  statisticsMs = input<number>();

  starts = STATISTICS_STARTS;
  statusTones = STATUS_TONES;

  changedStart = output<StatisticsStart>();
  clickedCompute = output<void>();

  targetRows = computed<TargetRowView[]>(() =>
    (this.statistics()?.targets ?? []).map((row) => ({
      ...row,
      label: this.targetLabels[row.id as CalibrationTargetId] ?? row.id,
      valueText: this.#formatValue(row.value, row.unit),
      targetText: this.#formatTarget(row),
    })),
  );

  startLabels: Record<StatisticsStart, string> = {
    epoch: $localize`:@@uiLab-marketStatistics-startEpoch:Ab Epoche`,
    'game-start': $localize`:@@uiLab-marketStatistics-startGame:Ab Spielstart`,
  };
  statusLabels: Record<TargetStatus, string> = {
    ok: $localize`:@@uiLab-marketStatistics-statusOk:im Ziel`,
    off: $localize`:@@uiLab-marketStatistics-statusOff:abweichend`,
    short: $localize`:@@uiLab-marketStatistics-statusShort:zu kurz`,
    info: $localize`:@@uiLab-marketStatistics-statusInfo:Info`,
  };
  sizeLabels: Record<SizeClass, string> = {
    large: $localize`:@@uiLab-marketStatistics-sizeLarge:Large Caps`,
    mid: $localize`:@@uiLab-marketStatistics-sizeMid:Mid Caps`,
    small: $localize`:@@uiLab-marketStatistics-sizeSmall:Small Caps`,
  };
  targetLabels: Record<CalibrationTargetId, string> = {
    'world-return': $localize`:@@uiLab-marketStatistics-targetWorldReturn:Weltindex (Performance), geometrische Rendite p. a.`,
    'world-price-return': $localize`:@@uiLab-marketStatistics-targetWorldPriceReturn:Weltindex (Kurs), geometrische Rendite p. a.`,
    'world-volatility': $localize`:@@uiLab-marketStatistics-targetWorldVolatility:Weltindex, Volatilität p. a.`,
    'world-volatility-weekly': $localize`:@@uiLab-marketStatistics-targetWorldVolatilityWeekly:Weltindex, Volatilität p. a. (Wochenrenditen)`,
    'world-volatility-monthly': $localize`:@@uiLab-marketStatistics-targetWorldVolatilityMonthly:Weltindex, Volatilität p. a. (Monatsrenditen)`,
    'world-autocorrelation-lag1': $localize`:@@uiLab-marketStatistics-targetWorldAutocorrelationLag1:Weltindex, Autokorrelation der Tagesrenditen, Lag 1`,
    'world-max-drawdown': $localize`:@@uiLab-marketStatistics-targetWorldMaxDrawdown:Weltindex (Performance), größter Drawdown`,
    'world-longest-underwater': $localize`:@@uiLab-marketStatistics-targetWorldLongestUnderwater:Weltindex (Performance), längste Zeit unter dem Hoch (Jahre)`,
    'world-worst-30y-return': $localize`:@@uiLab-marketStatistics-targetWorldWorst30yReturn:Weltindex (Performance), schlechtestes 30-Jahres-Fenster p. a.`,
    'region-volatility': $localize`:@@uiLab-marketStatistics-targetRegionVolatility:Regionalindizes (breit), Volatilität p. a. (Median)`,
    'region-max-drawdown': $localize`:@@uiLab-marketStatistics-targetRegionMaxDrawdown:Regionalindizes (breit), größter Drawdown (Median)`,
    'region-correlation': $localize`:@@uiLab-marketStatistics-targetRegionCorrelation:Regionalindizes (breit), Korrelation der Monatsrenditen (Mittel)`,
    'large-volatility': $localize`:@@uiLab-marketStatistics-targetLargeVolatility:Large Caps, Volatilität p. a. (Median)`,
    'mid-volatility': $localize`:@@uiLab-marketStatistics-targetMidVolatility:Mid Caps, Volatilität p. a. (Median)`,
    'small-volatility': $localize`:@@uiLab-marketStatistics-targetSmallVolatility:Small Caps, Volatilität p. a. (Median)`,
    'correlation-within': $localize`:@@uiLab-marketStatistics-targetCorrelationWithinLarge:Korrelation innerhalb eines Sektors (Tag, Large Caps je Region)`,
    'correlation-between': $localize`:@@uiLab-marketStatistics-targetCorrelationBetweenLarge:Korrelation zwischen Sektoren (Tag, Large Caps je Region)`,
    'correlation-within-all': $localize`:@@uiLab-marketStatistics-targetCorrelationWithin:Korrelation innerhalb eines Sektors (Tag, je Region)`,
    'correlation-between-all': $localize`:@@uiLab-marketStatistics-targetCorrelationBetween:Korrelation zwischen Sektoren (Tag, je Region)`,
    'weekly-correlation-within': $localize`:@@uiLab-marketStatistics-targetWeeklyCorrelationWithin:Korrelation innerhalb eines Sektors (Woche, alle)`,
    'weekly-correlation-between': $localize`:@@uiLab-marketStatistics-targetWeeklyCorrelationBetween:Korrelation zwischen Sektoren (Woche, alle)`,
    'bear-markets': $localize`:@@uiLab-marketStatistics-targetBearMarkets:Bärenmärkte des Weltindex je Jahr`,
    'bear-markets-common': $localize`:@@uiLab-marketStatistics-targetBearMarketsCommon:Bärenmärkte des Weltindex je Jahr (übliche Zählung, Kursindex)`,
    'world-kurtosis': $localize`:@@uiLab-marketStatistics-targetWorldKurtosis:Weltindex, Kurtosis der Tagesrenditen`,
    'stock-kurtosis': $localize`:@@uiLab-marketStatistics-targetStockKurtosis:Aktien, Kurtosis der Tagesrenditen (Median)`,
    'stock-autocorrelation-lag1': $localize`:@@uiLab-marketStatistics-targetStockAutocorrelationLag1:Aktien, Autokorrelation der Tagesrenditen, Lag 1 (Median)`,
    'stock-abs-autocorrelation-lag1': $localize`:@@uiLab-marketStatistics-targetStockAbsAutocorrelationLag1:Aktien, Autokorrelation der Beträge der Tagesrenditen, Lag 1 (Median)`,
    'stock-max-price': $localize`:@@uiLab-marketStatistics-targetStockMaxPrice:Aktien, Höchstkurs im Zeitraum (€)`,
    'equal-weight-premium': $localize`:@@uiLab-marketStatistics-targetEqualWeightPremium:Mehrrendite der Gleichgewichtung (jährlich umgeschichtet) gegen den Weltindex p. a.`,
    'drawdown-strategy-premium': $localize`:@@uiLab-marketStatistics-targetDrawdownStrategyPremium:Mehrrendite der 20 Aktien mit dem größten Abstand zum Hoch (jährlich) p. a.`,
    'negative-30y-share': $localize`:@@uiLab-marketStatistics-targetNegative30yShare:Aktien mit negativer Rendite über 30 Jahre (Anteil)`,
    'clustering-lag1': $localize`:@@uiLab-marketStatistics-targetClusteringLag1:Volatilitäts-Cluster: Autokorrelation r², Lag 1`,
    'clustering-mean': $localize`:@@uiLab-marketStatistics-targetClusteringMean:Volatilitäts-Cluster: Autokorrelation r², Lag 1–20`,
    'world-dividend-yield': $localize`:@@uiLab-marketStatistics-targetWorldDividendYield:Weltindex, Dividendenrendite p. a.`,
    'stock-dividend-yield-median': $localize`:@@uiLab-marketStatistics-targetStockDividendYieldMedian:Aktien, Dividendenrendite p. a. (Median)`,
    'stock-dividend-yield-max': $localize`:@@uiLab-marketStatistics-targetStockDividendYieldMax:Aktien, Dividendenrendite p. a. (Maximum)`,
    'intraday-profile': $localize`:@@uiLab-marketStatistics-targetIntradayProfileMedian:Tagesverlauf: Volatilität zu Eröffnung und Schluss ÷ Mitte (Median)`,
    'overnight-share-world': $localize`:@@uiLab-marketStatistics-targetOvernightShareWorld:Overnight-Anteil der Varianz, Weltindex`,
    'overnight-share-north-america': $localize`:@@uiLab-marketStatistics-targetOvernightShareNorthAmerica:Overnight-Anteil der Varianz, Nordamerika (breiter Index)`,
    'overnight-share-europe': $localize`:@@uiLab-marketStatistics-targetOvernightShareEurope:Overnight-Anteil der Varianz, Europa (breiter Index)`,
    'overnight-share-asia-pacific': $localize`:@@uiLab-marketStatistics-targetOvernightShareAsiaPacific:Overnight-Anteil der Varianz, Asien-Pazifik (breiter Index)`,
    'overnight-share-emerging-markets': $localize`:@@uiLab-marketStatistics-targetOvernightShareEmergingMarkets:Overnight-Anteil der Varianz, Schwellenländer (breiter Index)`,
    'overnight-share-stocks': $localize`:@@uiLab-marketStatistics-targetOvernightShareStocks:Overnight-Anteil der Varianz, Aktien (Median)`,
  };

  onSelectStart(start: StatisticsStart): void {
    this.changedStart.emit(start);
  }

  onCompute(): void {
    this.clickedCompute.emit();
  }

  #formatValue(value: number, unit: TargetUnit): string {
    return formatOptional(value, (finite) =>
      unit === 'percent' ? formatPercent(finite, 1) : formatNumber(finite, 2),
    );
  }

  #formatTarget({ min, max, unit }: TargetRow): string {
    if (min !== undefined && max !== undefined) {
      return `${this.#formatValue(min, unit)} – ${this.#formatValue(max, unit)}`;
    }
    if (min !== undefined) {
      return `≥ ${this.#formatValue(min, unit)}`;
    }
    return max === undefined ? '' : `≤ ${this.#formatValue(max, unit)}`;
  }
}
