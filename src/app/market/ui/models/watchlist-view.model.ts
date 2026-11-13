import { InstrumentKind } from '@app/market/domain/models/instrument.model';

/** A row of the watchlist (US-MK-04): live price and change, the sparkline of one month. */
export interface WatchlistRowView {
  id: string;
  series: number;
  name: string;
  ticker: string;
  kind: InstrumentKind;
  /** `null` until the first quote or screener figures arrived. */
  last: number | null;
  changeRatio: number | null;
  /** Empty until the screener figures arrived. */
  sparkline: readonly number[];
}

/** A move within the watchlist: list positions before and after. */
export interface WatchlistMove {
  from: number;
  to: number;
}

/** Whether instruments are on the watchlist, for the star buttons of screener and instrument page. */
export interface WatchlistMembership {
  ids: ReadonlySet<string>;
  /** `MAX_WATCHLIST_LENGTH` reached: nothing more can be added. */
  full: boolean;
  /** The list is known (the projection arrived); before, nothing can be changed. */
  known: boolean;
}

/** A star button was pressed: `watched` is the wanted state. */
export interface WatchlistToggle {
  id: string;
  watched: boolean;
}
