import { Cents } from '@app/shared/domain/models/money.model';

import { CurveTables, SupportValues } from './day-curve';
import { MarketContext } from './market-context';
import { monthStartEntry, recomputeSupportDays } from './market-history';
import { MarketDay } from './models/market-day.model';
import { FactorHistory } from './models/market-state.model';
import { etfSeries, seriesCount } from './series';

interface DayEntry {
  /** Close per series, `null` while no close of the day was asked for. */
  closes: Float64Array | null;
  /** Ex-dividend in cents per series (shares and ETFs; 0 for indices and other days). */
  dividends: Float64Array;
}

/**
 * Closes and ex-dividends of whole market days from the support points (TS §6.8, §11.7), never
 * from minute curves: long periods (performance over five years, trailing dividends) cost one day
 * step per market day instead of all minute curves. The entries are a cache: `prepare` computes
 * the missing days of a request (from their month start, at most one month of day steps per
 * month) and drops the days no longer asked for, so the window moves on by a few day steps per
 * market day.
 *
 * Callers ask only for closes of days whose sessions have ended (TS §4.5, rule 7); dividends of
 * the current day are announced 20 market days before and may be read.
 */
export class DailyCloses {
  readonly #context: MarketContext;
  readonly #history: FactorHistory;
  readonly #tables: CurveTables;
  readonly #entries = new Map<number, DayEntry>();

  constructor(context: MarketContext, history: FactorHistory, tables: CurveTables) {
    this.#context = context;
    this.#history = history;
    this.#tables = tables;
  }

  /** Days held in the cache, ascending. */
  get days(): number[] {
    return [...this.#entries.keys()].sort((a, b) => a - b);
  }

  /**
   * Makes the closes of `closeDays` and the dividends of `dividendDays` (market days) available
   * and drops all other days.
   */
  prepare(closeDays: Iterable<number>, dividendDays: Iterable<number>): void {
    const wantedCloses = new Set(closeDays);
    const wanted = new Set([...wantedCloses, ...dividendDays]);
    for (const day of this.#entries.keys()) {
      if (!wanted.has(day)) {
        this.#entries.delete(day);
      }
    }
    const missing = [...wanted]
      .filter((day) => {
        const entry = this.#entries.get(day);
        return entry === undefined || (entry.closes === null && wantedCloses.has(day));
      })
      .sort((a, b) => a - b);
    // One recomputation per month start; its day steps run up to the last missing day of it.
    let start = 0;
    while (start < missing.length) {
      const monthStart = monthStartEntry(this.#history, missing[start]).day;
      let end = start + 1;
      while (
        end < missing.length &&
        monthStartEntry(this.#history, missing[end]).day === monthStart
      ) {
        end++;
      }
      const group = new Set(missing.slice(start, end));
      recomputeSupportDays(
        this.#context,
        this.#history,
        missing[start],
        missing[end - 1] + 1,
        (marketDay) => {
          if (group.has(marketDay.day)) {
            this.#store(marketDay.day, marketDay, wantedCloses.has(marketDay.day));
          }
        },
      );
      start = end;
    }
  }

  /** Close of `series` on the prepared market day `day`. */
  close(series: number, day: number): number {
    const closes = this.#entries.get(day)?.closes;
    if (closes === null || closes === undefined) {
      throw new RangeError(`DailyCloses: no closes of day ${day} prepared`);
    }
    return closes[series];
  }

  /** Ex-dividend in cents per share of `series` on the prepared market day `day`, else 0. */
  dividendCents(series: number, day: number): Cents {
    const entry = this.#entries.get(day);
    if (entry === undefined) {
      throw new RangeError(`DailyCloses: day ${day} not prepared`);
    }
    return entry.dividends[series];
  }

  #store(day: number, marketDay: Readonly<MarketDay>, withCloses: boolean): void {
    const context = this.#context;
    const count = seriesCount(context);
    const dividends = new Float64Array(count);
    dividends.set(marketDay.exDividendCents, 0);
    dividends.set(marketDay.etfExCents, etfSeries(context, 0));
    let closes: Float64Array | null = null;
    if (withCloses) {
      const support = new SupportValues(this.#tables, marketDay);
      closes = new Float64Array(count);
      for (let s = 0; s < count; s++) {
        closes[s] = support.value(s, 'close');
      }
    }
    this.#entries.set(day, { closes, dividends });
  }
}
