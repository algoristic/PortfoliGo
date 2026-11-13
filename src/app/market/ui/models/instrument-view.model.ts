import { ChartColor } from '@app/charts/ui/models/chart-color.model';
import { ExchangeStatus } from '@app/clock/domain/models/exchange-status.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { FigurePeriod } from '@app/market/domain/models/instrument-figures.model';
import { IndexVariant, InstrumentKind } from '@app/market/domain/models/instrument.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { CompanyProfile } from '@app/world/domain/models/company.model';
import { EtfDistributionFrequency, EtfReplication } from '@app/world/domain/models/etf.model';
import {
  RegionId,
  RiskClass,
  SectorId,
  SizeClass,
  Style,
} from '@app/world/domain/models/taxonomy.model';

/** A link to another instrument of the world (index, constituent). */
export interface InstrumentLink {
  id: string;
  name: string;
}

/**
 * The price head of the instrument page (US-MK-03, US-MK-05) with the live quote; prices are
 * `null` until the first quote arrived, bid and ask (and the spread) always for indices.
 */
export interface InstrumentHeadView {
  id: string;
  kind: InstrumentKind;
  name: string;
  ticker: string;
  isin: string | null;
  /** `null` for indices (they have no exchange). */
  exchangeName: string | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  /** Spread relative to the middle of bid and ask. */
  spreadRatio: number | null;
  change: number | null;
  changeRatio: number | null;
  /** Decimal places of the last price on the price grid (PS §10.4). */
  priceDecimals: number;
  /**
   * Shares and ETFs: their exchange; indices: the exchanges of their region (all for global
   * ones), open while one of them is. `null` before the clock is known.
   */
  status: ExchangeStatus | null;
  /** ETFs: indicative value (iNAV, TS §6.6) of the newest figures and the tick it belongs to. */
  indicativeValue: number | null;
  indicativeTick: Tick | null;
}

/** Key figures of the instrument page; ratios as fractions, `null` = not available. */
export interface InstrumentFiguresView {
  kind: InstrumentKind;
  /** Shares: market capitalisation; ETFs: fund volume; in euros. */
  size: number | null;
  dividendYield: number | null;
  volatility: number | null;
  beta: number | null;
  performance: Readonly<Record<FigurePeriod, number | null>>;
}

export interface StockProfileView {
  kind: 'stock';
  sectorId: SectorId | null;
  industryId: string | null;
  countryId: string | null;
  size: SizeClass | null;
  style: Style | null;
  riskClass: RiskClass | null;
  profile: CompanyProfile;
  foundedYear: number;
  employees: number;
  /** Free-float shares ÷ shares outstanding. */
  freeFloat: number;
  indices: readonly InstrumentLink[];
}

export interface EtfProfileView {
  kind: 'etf';
  /** The tracked index (price index), `null` while unknown. */
  index: InstrumentLink | null;
  ter: number;
  distribution: 'accumulating' | 'distributing';
  distributionFrequency: EtfDistributionFrequency | null;
  replication: EtfReplication;
  issuerName: string;
  /** In euros. */
  fundVolume: number;
}

export interface IndexProfileView {
  kind: 'index';
  variant: IndexVariant;
  constituentCount: number;
  /** Maximum weight of a constituent, `null` without capping. */
  capWeight: number | null;
  /** The other series of the same index (price or total return). */
  sibling: InstrumentLink | null;
}

export type InstrumentProfileView = StockProfileView | EtfProfileView | IndexProfileView;

export interface CompositionSegmentView<T extends string> {
  /** A code, or `other` for the rest beyond the coloured segments. */
  key: T | 'other';
  weight: number;
  color: ChartColor;
}

export interface CompositionPositionView extends InstrumentLink {
  weight: number;
}

/** Composition of an index or of the index an ETF tracks (US-MK-03). */
export interface CompositionView {
  constituentCount: number;
  top: readonly CompositionPositionView[];
  regions: readonly CompositionSegmentView<RegionId>[];
  sectors: readonly CompositionSegmentView<SectorId>[];
}

/** A dividend date; ticks are the starts of the days. */
export interface DividendDateView {
  exTick: Tick;
  paymentTick: Tick;
  /** `null` while not announced (shares) and always for ETF distributions. */
  cents: Cents | null;
}

/**
 * Dividends of a share or distributing ETF (US-MK-03, US-MK-06); `accumulating` for ETFs that
 * reinvest their income.
 */
export type DividendsView =
  | { kind: 'accumulating' }
  | { kind: 'stock' | 'etf'; next: DividendDateView | null; history: readonly DividendDateView[] };
