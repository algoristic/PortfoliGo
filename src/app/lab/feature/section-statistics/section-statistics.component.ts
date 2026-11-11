import { Component, input, output } from '@angular/core';

import { formatGameDate } from '../../../clock/domain/game-time-format';
import { Tick } from '../../../clock/domain/models/time.model';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { BadgeTone } from '../../../shared/ui/badge/badge.model';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { formatNumber, formatPercent } from '../../../shared/util/format';
import { SizeClass } from '../../../world/domain/models/taxonomy.model';
import { CalibrationTargetId } from '../../domain/calibration-targets';
import {
  LabStatistics,
  STATISTICS_STARTS,
  StatisticsStart,
  TargetRow,
  TargetStatus,
  TargetUnit,
} from '../../domain/models/lab-statistics.model';
import { SectionCorrelationMatrixComponent } from '../../ui/section-correlation-matrix/section-correlation-matrix.component';
import { SectionPhaseTimelineComponent } from '../../ui/section-phase-timeline/section-phase-timeline.component';
import { SectionReturnHistogramComponent } from '../../ui/section-return-histogram/section-return-histogram.component';

const STATUS_TONES: Record<TargetStatus, BadgeTone> = {
  ok: 'up',
  off: 'down',
  short: 'warning',
  info: 'neutral',
  open: 'neutral',
};

/** Statistics of the lab against the calibration targets (TS §6.9, §14.2). */
@Component({
  selector: 'app-section-statistics',
  imports: [
    BadgeComponent,
    ButtonDirective,
    SectionCorrelationMatrixComponent,
    SectionPhaseTimelineComponent,
    SectionReturnHistogramComponent,
    SkeletonComponent,
  ],
  templateUrl: './section-statistics.component.html',
  styleUrl: './section-statistics.component.scss',
})
export class SectionStatisticsComponent {
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

  startLabels: Record<StatisticsStart, string> = {
    epoch: $localize`:@@featureLab-sectionStatistics-startEpoch:Ab Epoche`,
    'game-start': $localize`:@@featureLab-sectionStatistics-startGame:Ab Spielstart`,
  };
  statusLabels: Record<TargetStatus, string> = {
    ok: $localize`:@@featureLab-sectionStatistics-statusOk:im Ziel`,
    off: $localize`:@@featureLab-sectionStatistics-statusOff:abweichend`,
    short: $localize`:@@featureLab-sectionStatistics-statusShort:zu kurz`,
    info: $localize`:@@featureLab-sectionStatistics-statusInfo:Info`,
    open: $localize`:@@featureLab-sectionStatistics-statusOpen:AP 1.8b`,
  };
  sizeLabels: Record<SizeClass, string> = {
    large: $localize`:@@featureLab-sectionStatistics-sizeLarge:Large Caps`,
    mid: $localize`:@@featureLab-sectionStatistics-sizeMid:Mid Caps`,
    small: $localize`:@@featureLab-sectionStatistics-sizeSmall:Small Caps`,
  };
  targetLabels: Record<CalibrationTargetId, string> = {
    'world-return': $localize`:@@featureLab-sectionStatistics-targetWorldReturn:Weltindex (Performance), geometrische Rendite p. a.`,
    'world-price-return': $localize`:@@featureLab-sectionStatistics-targetWorldPriceReturn:Weltindex (Kurs), geometrische Rendite p. a.`,
    'world-volatility': $localize`:@@featureLab-sectionStatistics-targetWorldVolatility:Weltindex, Volatilität p. a.`,
    'large-volatility': $localize`:@@featureLab-sectionStatistics-targetLargeVolatility:Large Caps, Volatilität p. a. (Median)`,
    'mid-volatility': $localize`:@@featureLab-sectionStatistics-targetMidVolatility:Mid Caps, Volatilität p. a. (Median)`,
    'small-volatility': $localize`:@@featureLab-sectionStatistics-targetSmallVolatility:Small Caps, Volatilität p. a. (Median)`,
    'correlation-within': $localize`:@@featureLab-sectionStatistics-targetCorrelationWithin:Korrelation innerhalb eines Sektors (Tag, je Region)`,
    'correlation-between': $localize`:@@featureLab-sectionStatistics-targetCorrelationBetween:Korrelation zwischen Sektoren (Tag, je Region)`,
    'weekly-correlation-within': $localize`:@@featureLab-sectionStatistics-targetWeeklyCorrelationWithin:Korrelation innerhalb eines Sektors (Woche, alle)`,
    'weekly-correlation-between': $localize`:@@featureLab-sectionStatistics-targetWeeklyCorrelationBetween:Korrelation zwischen Sektoren (Woche, alle)`,
    'bear-markets': $localize`:@@featureLab-sectionStatistics-targetBearMarkets:Bärenmärkte des Weltindex je Jahr`,
    'world-kurtosis': $localize`:@@featureLab-sectionStatistics-targetWorldKurtosis:Weltindex, Kurtosis der Tagesrenditen`,
    'stock-kurtosis': $localize`:@@featureLab-sectionStatistics-targetStockKurtosis:Aktien, Kurtosis der Tagesrenditen (Median)`,
    'clustering-lag1': $localize`:@@featureLab-sectionStatistics-targetClusteringLag1:Volatilitäts-Cluster: Autokorrelation r², Lag 1`,
    'clustering-mean': $localize`:@@featureLab-sectionStatistics-targetClusteringMean:Volatilitäts-Cluster: Autokorrelation r², Lag 1–20`,
    'world-dividend-yield': $localize`:@@featureLab-sectionStatistics-targetWorldDividendYield:Weltindex, Dividendenrendite p. a.`,
    'stock-dividend-yield-median': $localize`:@@featureLab-sectionStatistics-targetStockDividendYieldMedian:Aktien, Dividendenrendite p. a. (Median)`,
    'stock-dividend-yield-max': $localize`:@@featureLab-sectionStatistics-targetStockDividendYieldMax:Aktien, Dividendenrendite p. a. (Maximum)`,
    'intraday-profile': $localize`:@@featureLab-sectionStatistics-targetIntradayProfile:Tagesverlauf der Volatilität`,
    'overnight-share': $localize`:@@featureLab-sectionStatistics-targetOvernightShare:Overnight-Anteil der Varianz`,
    'long-term': $localize`:@@featureLab-sectionStatistics-targetLongTerm:Langzeitverhalten über 50 und 100 Jahre`,
  };

  onSelectStart(start: StatisticsStart): void {
    this.changedStart.emit(start);
  }

  onCompute(): void {
    this.clickedCompute.emit();
  }

  targetLabel(row: TargetRow): string {
    return this.targetLabels[row.id as CalibrationTargetId] ?? row.id;
  }

  formatValue(value: number, unit: TargetUnit): string {
    if (!Number.isFinite(value)) {
      return '–';
    }
    return unit === 'percent' ? formatPercent(value, 1) : formatNumber(value, 2);
  }

  formatTarget(row: TargetRow): string {
    const { min, max, unit } = row;
    if (min !== undefined && max !== undefined) {
      return `${this.formatValue(min, unit)} – ${this.formatValue(max, unit)}`;
    }
    if (min !== undefined) {
      return `≥ ${this.formatValue(min, unit)}`;
    }
    return max === undefined ? '' : `≤ ${this.formatValue(max, unit)}`;
  }

  formatDate(tick: Tick | null): string {
    return tick === null ? '–' : formatGameDate(tick);
  }

  formatPercent(value: number): string {
    return Number.isFinite(value) ? formatPercent(value, 1) : '–';
  }

  formatNumber(value: number, fractionDigits = 0): string {
    return formatNumber(value, fractionDigits);
  }
}
