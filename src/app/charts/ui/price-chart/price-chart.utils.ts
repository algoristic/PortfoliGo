import { tickToDateTime } from '@app/clock/domain/calendar-logic';
import { formatGameTime } from '@app/clock/domain/game-time-format';
import { GAME_SECONDS_PER_TICK, Tick } from '@app/clock/domain/models/time.model';
import { Candle } from '@app/market/domain/models/candle.model';

import { perLocale } from '@app/shared/util/locale';

import { PriceChartCandle, PriceChartColors, PriceChartLinePoint } from './price-chart.model';

import { CHART_COLORS, ChartColor } from '../models/chart-color.model';

const MS_PER_SECOND = 1000;

// Tick 0 is 01.01.2020 00:00 of the Gregorian game calendar; as UTC, every tick maps to a real
// timestamp, so the chart library's date logic (month and year boundaries) applies unchanged.
const EPOCH = tickToDateTime(0);
const EPOCH_SECONDS =
  Date.UTC(EPOCH.year, EPOCH.month - 1, EPOCH.day, EPOCH.hour, EPOCH.minute) / MS_PER_SECOND;

/** `TickMarkType` of lightweight-charts (an enum we must not import eagerly). */
const TICK_MARK_YEAR = 0;
const TICK_MARK_MONTH = 1;
const TICK_MARK_DAY = 2;

const yearFormat = perLocale(
  (locale) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric' }),
);
const monthFormat = perLocale(
  (locale) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short' }),
);
const dayFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
    }),
);
const timeFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
    }),
);

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
      return yearFormat().format(ms);
    case TICK_MARK_MONTH:
      return monthFormat().format(ms);
    case TICK_MARK_DAY:
      return dayFormat().format(ms);
    default:
      return timeFormat().format(ms);
  }
}

export function toLinePoint(candle: Candle): PriceChartLinePoint {
  return { time: tickToChartTime(candle.tick), value: candle.close };
}

export function toLinePoints(candles: readonly Candle[]): PriceChartLinePoint[] {
  return candles.map(toLinePoint);
}

/** Chart candle; missing high and low (`NaN` after batch runs) fall back to open and close. */
export function toChartCandle(candle: Candle): PriceChartCandle {
  return {
    time: tickToChartTime(candle.tick),
    open: candle.open,
    high: Number.isNaN(candle.high) ? Math.max(candle.open, candle.close) : candle.high,
    low: Number.isNaN(candle.low) ? Math.min(candle.open, candle.close) : candle.low,
    close: candle.close,
  };
}

export function toChartCandles(candles: readonly Candle[]): PriceChartCandle[] {
  return candles.map(toChartCandle);
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
    categories: Object.fromEntries(CHART_COLORS.map((color) => [color, token(color)])) as Record<
      ChartColor,
      string
    >,
  };
}

/** Whether `next` is `previous` with zero or more older candles in front (history loaded). */
export function isPrepended(previous: readonly Candle[], next: readonly Candle[]): boolean {
  const offset = next.length - previous.length;
  return (
    previous.length > 0 &&
    offset >= 0 &&
    next[offset].tick === previous[0].tick &&
    next[next.length - 1].tick === previous[previous.length - 1].tick
  );
}

/**
 * The items to pass to `series.update`, in order, when `next` differs from `previous` only at the
 * end (TS §11.7): the newest item changed, or it was finished and one new item follows; empty when
 * nothing changed. `null`
 * when the series needs `setData` (other changes, prepended history, a new data set).
 */
export function incrementalUpdates<T extends { tick: number }>(
  previous: readonly T[],
  next: readonly T[],
  equal: (a: T, b: T) => boolean = (a, b) => a === b,
): T[] | null {
  const last = previous.length - 1;
  if (last < 0 || (next.length !== previous.length && next.length !== previous.length + 1)) {
    return null;
  }
  for (let index = 0; index < last; index++) {
    if (!equal(previous[index], next[index])) {
      return null;
    }
  }
  if (next[last].tick !== previous[last].tick) {
    return null;
  }
  return next.slice(equal(previous[last], next[last]) ? last + 1 : last);
}

/** The candle that starts at `tick`, `undefined` if none does (binary search, ascending ticks). */
export function candleAt(candles: readonly Candle[], tick: number): Candle | undefined {
  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = candles[middle];
    if (candidate.tick === tick) {
      return candidate;
    }
    if (candidate.tick < tick) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return undefined;
}

/** Bars before the oldest candle at which the chart asks for older candles. */
export const HISTORY_THRESHOLD_BARS = 10;

export interface HistoryTrigger {
  /** No request for the current candles yet. */
  armed: boolean;
  /** The user scrolled or zoomed since the data set was fitted. */
  userMoved: boolean;
  /** Logical index of the left edge of the view, `null` without data. */
  from: number | null;
}

/** Whether the chart asks for older candles; a fitted view starts at the oldest candle anyway. */
export function shouldRequestHistory({ armed, userMoved, from }: HistoryTrigger): boolean {
  return armed && userMoved && from !== null && from < HISTORY_THRESHOLD_BARS;
}
