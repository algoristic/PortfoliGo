import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { DAYS_PER_WEEK, Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { intradayMinutes } from './candle-logic';
import { Candle, CandleResolution } from './models/candle.model';

export const CHART_TRADE_SIDES = ['buy', 'sell'] as const;
export type ChartTradeSide = (typeof CHART_TRADE_SIDES)[number];

/** An own purchase or sale of the shown instrument (US-PF-06): when it executed and its side. */
export interface ChartTrade {
  id: string;
  tick: Tick;
  side: ChartTradeSide;
}

/** A trade placed on the candle it executed in: `tick` is the start of that candle. */
export interface ChartTradeMarker {
  id: string;
  tick: Tick;
  side: ChartTradeSide;
}

/**
 * End of the candle that starts at `tick` (exclusive, TS §11.7): intraday after its minutes, a day
 * candle at the start of the next day, a week candle seven days after its first day.
 */
export function candleEnd(tick: Tick, resolution: CandleResolution): Tick {
  switch (resolution) {
    case '1d':
      return dayStartTick(dayIndex(tick) + 1);
    case '1w':
      return dayStartTick(dayIndex(tick) + DAYS_PER_WEEK);
    default:
      return tick + intradayMinutes(resolution) * TICKS_PER_MINUTE;
  }
}

/**
 * Markers of the trades on the shown candles (US-PF-06 „Trades im Chart markiert“): each trade
 * sits on the candle whose period `[start, end)` contains its tick; trades outside the loaded
 * candles get no marker. Sorted by time, as the chart library needs them, ties in input order.
 */
export function tradeMarkers(
  trades: readonly ChartTrade[],
  candles: readonly Candle[],
  resolution: CandleResolution,
): ChartTradeMarker[] {
  const markers: ChartTradeMarker[] = [];
  for (const trade of trades) {
    const candle = candleContaining(candles, trade.tick);
    if (candle !== undefined && trade.tick < candleEnd(candle.tick, resolution)) {
      markers.push({ id: trade.id, tick: candle.tick, side: trade.side });
    }
  }
  return markers.sort((a, b) => a.tick - b.tick);
}

/** The newest candle that starts at or before `tick` (candles ascending); binary search. */
function candleContaining(candles: readonly Candle[], tick: Tick): Candle | undefined {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (candles[middle].tick <= tick) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low === 0 ? undefined : candles[low - 1];
}
