import { createCurveTables, CurveTables, DayCurves } from './day-curve';
import { MarketContext } from './market-context';
import { monthStartEntry, recomputeSupportDays } from './market-history';
import { copyMarketDay } from './market-step';
import { MarketDay } from './models/market-day.model';
import { FactorHistory } from './models/market-state.model';

/** High and low of all instruments on one trading day, in layout order. */
export interface DayHighLow {
  day: number;
  high: Float64Array;
  low: Float64Array;
}

/** Time-sliced background job that completes high and low of the daily candles (TS §6.8). */
export interface HighLowFill {
  /**
   * Processes up to `maxDays` trading days, newest first, and returns `true` when the job is done.
   * The caller decides how many days fit into a time slice; the result does not depend on it.
   */
  run(maxDays: number, onDay: (result: DayHighLow) => void): boolean;
}

/**
 * Job for the trading days in `[fromDay, toDay)`, all of which must have been stepped. Each month
 * is recomputed once from its month start state; the factor bridges of a day are shared by all
 * instruments.
 */
export function createHighLowFill(
  context: MarketContext,
  history: FactorHistory,
  fromDay: number,
  toDay: number,
  tables: CurveTables = createCurveTables(context),
): HighLowFill {
  const instrumentCount = context.layout.instrumentIds.length;
  const curves = new DayCurves(tables);
  /** Recomputed days of the current month, processed from the end. */
  const pending: MarketDay[] = [];
  let cursor = toDay;

  const loadMonth = (): void => {
    const chunkStart = Math.max(fromDay, monthStartEntry(history, cursor - 1).day);
    recomputeSupportDays(context, history, chunkStart, cursor, (day) => {
      pending.push(copyMarketDay(day));
    });
    cursor = chunkStart;
  };

  return {
    run(maxDays, onDay) {
      let processed = 0;
      while (processed < maxDays) {
        if (pending.length === 0) {
          if (cursor <= fromDay) {
            return true;
          }
          loadMonth();
          continue;
        }
        const day = pending.pop() as MarketDay;
        curves.load(day);
        const high = new Float64Array(instrumentCount);
        const low = new Float64Array(instrumentCount);
        for (let i = 0; i < instrumentCount; i++) {
          const curve = curves.instrumentCurve(i);
          let max = curve[0];
          let min = curve[0];
          for (let j = 1; j < curve.length; j++) {
            max = Math.max(max, curve[j]);
            min = Math.min(min, curve[j]);
          }
          high[i] = max;
          low[i] = min;
        }
        onDay({ day: day.day, high, low });
        processed++;
      }
      return pending.length === 0 && cursor <= fromDay;
    },
  };
}
