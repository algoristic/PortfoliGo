import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { HeatLevel } from '@app/market/domain/heatmap-logic';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { SectorId } from '@app/world/domain/models/taxonomy.model';

/** An index of the markets page (US-MK-01) with its quote and the line of the day. */
export interface OverviewIndexView {
  instrument: Instrument;
  /** `null` until the first quote arrived. */
  quote: SeriesQuote | null;
  /** Open and closes of the trading day, empty while they load. */
  sparkline: readonly number[];
}

/** A gainer or loser (US-MK-01). */
export interface MoverView {
  instrument: Instrument;
  quote: SeriesQuote;
}

/** A tile of the sector heat map (US-MK-01); `instrumentId` is the sector's price index. */
export interface SectorHeatView {
  sectorId: SectorId;
  instrumentId: string | null;
  changeRatio: number;
  level: HeatLevel;
}

export interface MarketMoversViewModel {
  gainers: readonly MoverView[];
  losers: readonly MoverView[];
  sectors: readonly SectorHeatView[];
}
