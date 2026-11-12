import { ExchangeStatus } from './models/exchange-status.model';
import { Tick, TradingHours } from './models/time.model';
import { isTradingTime, nextClose, nextOpen } from './trading-hours-logic';

/** Status of one exchange at `tick`: open until the next closing or closed until the next opening. */
export function exchangeStatus(hours: TradingHours, tick: Tick): ExchangeStatus {
  return isTradingTime(hours, tick)
    ? { open: true, changesAt: nextClose(hours, tick) }
    : { open: false, changesAt: nextOpen(hours, tick) };
}

/**
 * Status of a region with the trading hours of its exchanges (TS §3.3): open as long as at least
 * one of them is open, so overlapping sessions extend each other; closed until the first opening.
 * `null` for a region without exchanges.
 */
export function regionStatus(sessions: readonly TradingHours[], tick: Tick): ExchangeStatus | null {
  if (sessions.length === 0) {
    return null;
  }
  if (!sessions.some((hours) => isTradingTime(hours, tick))) {
    return { open: false, changesAt: Math.min(...sessions.map((hours) => nextOpen(hours, tick))) };
  }
  let changesAt = tick;
  let open = sessions.filter((hours) => isTradingTime(hours, changesAt));
  // Every round moves to a later closing; at the latest the weekend closes every session.
  while (open.length > 0) {
    const at = changesAt;
    changesAt = Math.max(...open.map((hours) => nextClose(hours, at)));
    open = sessions.filter((hours) => isTradingTime(hours, changesAt));
  }
  return { open: true, changesAt };
}
