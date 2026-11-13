import { SectorId } from '@app/world/domain/models/taxonomy.model';

import { SeriesQuote } from './series-quote.model';

/** Daily change of a sector index (heat map of the markets page, US-MK-01). */
export interface SectorMove {
  sectorId: SectorId;
  quote: SeriesQuote;
}

/**
 * Gainers, losers and sectors of the day (TS §8.3, §8.4), computed by the worker so that the UI
 * doesn't subscribe to every share. Changes as in the quotes (`changeRatio`, TS §8.4).
 */
export interface MarketMovers {
  /** Shares with the largest positive change, largest first. */
  gainers: SeriesQuote[];
  /** Shares with the largest negative change, largest loss first. */
  losers: SeriesQuote[];
  /** Price index of every sector, in the order of the world's indices. */
  sectors: SectorMove[];
}
