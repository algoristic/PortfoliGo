import { MicroUnits } from '@app/shared/domain/models/money.model';

/** What the buy and sell actions of an instrument need (US-HD-01, US-HD-02). */
export interface InstrumentTradeView {
  instrumentId: string;
  name: string;
  /** Shares and ETFs; indices have no bid and ask (TS §6.7). */
  tradable: boolean;
  /** The player has an open depot. */
  hasDepot: boolean;
  /** Shares held in all open depots. */
  quantity: MicroUnits;
  /** Shares not blocked by active sell orders. */
  free: MicroUnits;
}
