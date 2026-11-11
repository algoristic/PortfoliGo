export interface BidAsk {
  bid: number;
  ask: number;
}

/** Bid and ask around a mid price with the relative spread they were derived from (TS §6.7). */
export interface Quote extends BidAsk {
  mid: number;
  /** Relative spread before rounding to the price grid (0.001 = 0.1 %). */
  spread: number;
}
