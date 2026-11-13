import { Cents } from '@app/shared/domain/models/money.model';
import { RegionId, SectorId } from '@app/world/domain/models/taxonomy.model';

/** Performance periods of the instrument page (TS §8.2, US-MK-03): 1 month, 1 year, 5 years. */
export const FIGURE_PERIODS = ['m1', 'y1', 'y5'] as const;
export type FigurePeriod = (typeof FIGURE_PERIODS)[number];

/**
 * Key figures of a series at the current tick (TS §8.2, AP 4.5). Ratios are fractions
 * (0.03 = 3 %); a figure that doesn't apply or whose window isn't full is `null`.
 */
export interface InstrumentFigures {
  id: string;
  series: number;
  /** Last price as in the quote (`priceAt` at the current tick). */
  last: number;
  /**
   * Indicative value at the current tick (TS §6.6): outside the session the last price moves with
   * the factors; at the weekend the level of Friday 24:00. `null` without minute curves.
   */
  indicativeValue: number | null;
  /** Shares: shares outstanding × `last`, in euros; indices and ETFs `null` (ETFs: `fundVolume`). */
  marketCap: number | null;
  /** Trailing dividend yield as in the screener; indices `null`. */
  dividendYield: number | null;
  /** Annualised volatility of the daily log returns of the last 252 market days (× √252). */
  volatility: number | null;
  /** Beta of the same daily log returns against the world price index. */
  beta: number | null;
  /** Price change against the close of the reference day, as in the screener. */
  performance: Record<FigurePeriod, number | null>;
}

/** A paid dividend or ETF distribution (TS §6.5); days are day indices since the epoch. */
export interface DividendPayment {
  exDay: number;
  paymentDay: number;
  /** Amount per share in cents. */
  cents: Cents;
}

/**
 * The next ex-date of the fixed rhythm (TS §6.5); `cents` only once the dividend has been
 * announced (20 market days before the ex-date), `null` before and for ETF distributions.
 */
export interface UpcomingDividend {
  exDay: number;
  paymentDay: number;
  cents: Cents | null;
}

/** Dividend history and next date of a share or distributing ETF (US-MK-03, US-MK-06). */
export interface InstrumentDividends {
  /** Payments with an ex-date in the last five years up to now, newest first. */
  history: DividendPayment[];
  next: UpcomingDividend | null;
}

export interface CompositionPosition {
  /** Company ID. */
  id: string;
  series: number;
  name: string;
  /** Weight in the index (fraction of 1). */
  weight: number;
}

export interface CompositionShare<T extends string> {
  key: T;
  weight: number;
}

/**
 * Composition of an index, or of the index an ETF tracks (TS §5.5, §8.2, US-MK-03): weights of the
 * constituents at the close of the last market day before today, `n_i · P_i / Σ n · P` with the
 * capped free-float shares of the `IndexLayout`.
 */
export interface IndexComposition {
  indexId: string;
  constituentCount: number;
  /** The `MAX_TOP_POSITIONS` largest positions, descending (ties in constituent order). */
  top: CompositionPosition[];
  /** Weights summed per region and per sector, descending (ties by code). */
  regions: CompositionShare<RegionId>[];
  sectors: CompositionShare<SectorId>[];
}
