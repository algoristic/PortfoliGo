/** Quote of a subscribed series at the current tick (TS §8.3, §8.4). */
export interface SeriesQuote {
  series: number;
  /** Last price (`priceAt` at the current tick). */
  last: number;
  /** Bid and ask at the exchange without a venue mark-up; `null` for indices (not tradable). */
  bid: number | null;
  ask: number | null;
  /** Close of the trading day before the latest session that has opened. */
  previousClose: number;
  /** `last − previousClose`. */
  change: number;
  /** `change / previousClose`. */
  changeRatio: number;
}
