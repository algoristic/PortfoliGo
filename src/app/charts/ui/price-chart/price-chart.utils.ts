import { PriceChartCandle, PriceChartColors, PriceChartLinePoint } from './price-chart.model';

import { tickToDateTime } from '../../../clock/domain/calendar-logic';
import { formatGameTime } from '../../../clock/domain/game-time-format';
import { GAME_SECONDS_PER_TICK, Tick } from '../../../clock/domain/models/time.model';
import { Candle } from '../../../market/domain/models/candle.model';

const MS_PER_SECOND = 1000;
const LOCALE = 'de-DE';

// Tick 0 is 01.01.2020 00:00 of the Gregorian game calendar; as UTC, every tick maps to a real
// timestamp, so the chart library's date logic (month and year boundaries) applies unchanged.
const EPOCH = tickToDateTime(0);
const EPOCH_SECONDS =
  Date.UTC(EPOCH.year, EPOCH.month - 1, EPOCH.day, EPOCH.hour, EPOCH.minute) / MS_PER_SECOND;

/** `TickMarkType` of lightweight-charts (an enum we must not import eagerly). */
const TICK_MARK_YEAR = 0;
const TICK_MARK_MONTH = 1;
const TICK_MARK_DAY = 2;

const yearFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', year: 'numeric' });
const monthFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', month: 'short' });
const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
});

/** Chart time (seconds, UTC) of a game tick. */
export function tickToChartTime(tick: Tick): number {
  return EPOCH_SECONDS + tick * GAME_SECONDS_PER_TICK;
}

export function chartTimeToTick(time: number): Tick {
  return Math.round((time - EPOCH_SECONDS) / GAME_SECONDS_PER_TICK);
}

/** Crosshair label: weekday, date and time of the game, e.g. `Mo., 01.04.2030, 09:30`. */
export function formatChartTime(time: number): string {
  return formatGameTime(chartTimeToTick(time));
}

/** Label of a mark on the time axis; `tickMarkType` is lightweight-charts' `TickMarkType`. */
export function formatTickMark(time: number, tickMarkType: number): string {
  const ms = time * MS_PER_SECOND;
  switch (tickMarkType) {
    case TICK_MARK_YEAR:
      return yearFormat.format(ms);
    case TICK_MARK_MONTH:
      return monthFormat.format(ms);
    case TICK_MARK_DAY:
      return dayFormat.format(ms);
    default:
      return timeFormat.format(ms);
  }
}

export function toLinePoints(candles: readonly Candle[]): PriceChartLinePoint[] {
  return candles.map((candle) => ({ time: tickToChartTime(candle.tick), value: candle.close }));
}

/** Chart candles; missing high and low (`NaN` after batch runs) fall back to open and close. */
export function toChartCandles(candles: readonly Candle[]): PriceChartCandle[] {
  return candles.map((candle) => ({
    time: tickToChartTime(candle.tick),
    open: candle.open,
    high: Number.isNaN(candle.high) ? Math.max(candle.open, candle.close) : candle.high,
    low: Number.isNaN(candle.low) ? Math.min(candle.open, candle.close) : candle.low,
    close: candle.close,
  }));
}

/** Reads the chart colours from the `--pgo-*` tokens (computed style of `<html>`). */
export function readChartColors(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): PriceChartColors {
  const token = (name: string): string => style.getPropertyValue(`--pgo-${name}`).trim();
  return {
    background: token('surface'),
    text: token('fg'),
    textMuted: token('fg-muted'),
    grid: token('border'),
    line: token('accent'),
    up: token('up'),
    down: token('down'),
  };
}
