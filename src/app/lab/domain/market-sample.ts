import { CurveTables, SupportValues } from '../../market/domain/day-curve';
import { isMarketDay } from '../../market/domain/market-calendar';
import { phaseIndex } from '../../market/domain/market-context';
import { recomputeSupportDays } from '../../market/domain/market-history';
import { FactorHistory } from '../../market/domain/models/market-state.model';
import { indexSeries, totalReturnSeries } from '../../market/domain/series';
import { World } from '../../world/domain/models/world.model';

const CENTS_PER_EURO = 100;

/** Daily closes and returns of a period, collected in one pass over the support points. */
export interface MarketSample {
  /** Market days of the period (day indices since the epoch). */
  days: Int32Array;
  /** Phase index per market day (`phaseIndex`). */
  phases: Uint8Array;
  /** Closes of the world price index and the world total return index per market day. */
  worldPrice: Float64Array;
  worldTotalReturn: Float64Array;
  /** Per share: log returns from close to close, one fewer than market days. */
  stockReturns: Float32Array[];
  /** Per share: sum of the ex-dividend amounts in euros and of the closes. */
  dividendSum: Float64Array;
  closeSum: Float64Array;
}

/**
 * Collects the sample for the market days in `[fromDay, toDay)` from the month-start states
 * (`recomputeSupportDays`), without minute bridges. Lab code: returns use `Math.log`, the sample
 * never feeds back into the simulation.
 */
export function collectMarketSample(
  tables: CurveTables,
  history: FactorHistory,
  world: World,
  fromDay: number,
  toDay: number,
): MarketSample {
  const { context } = tables;
  const shareCount = context.layout.instrumentIds.length;
  const worldIndex = world.indices.findIndex((index) => index.kind === 'world');
  if (worldIndex < 0) {
    throw new Error('collectMarketSample: the world has no world index');
  }
  const priceSeries = indexSeries(context, worldIndex);
  const totalReturnSeriesIndex = totalReturnSeries(context, worldIndex);

  let marketDays = 0;
  for (let d = fromDay; d < toDay; d++) {
    if (isMarketDay(d)) {
      marketDays++;
    }
  }
  const days = new Int32Array(marketDays);
  const phases = new Uint8Array(marketDays);
  const worldPrice = new Float64Array(marketDays);
  const worldTotalReturn = new Float64Array(marketDays);
  const stockReturns = Array.from(
    { length: shareCount },
    () => new Float32Array(Math.max(0, marketDays - 1)),
  );
  const dividendSum = new Float64Array(shareCount);
  const closeSum = new Float64Array(shareCount);
  const previousCloses = new Float64Array(shareCount);

  let n = 0;
  recomputeSupportDays(context, history, fromDay, toDay, (day) => {
    const support = new SupportValues(tables, day);
    for (let i = 0; i < shareCount; i++) {
      const close = support.value(i, 'close');
      if (n > 0) {
        stockReturns[i][n - 1] = Math.log(close / previousCloses[i]);
      }
      previousCloses[i] = close;
      closeSum[i] += close;
      dividendSum[i] += day.exDividendCents[i] / CENTS_PER_EURO;
    }
    days[n] = day.day;
    phases[n] = phaseIndex(day.phase);
    worldPrice[n] = support.value(priceSeries, 'close');
    worldTotalReturn[n] = support.value(totalReturnSeriesIndex, 'close');
    n++;
  });
  if (n !== marketDays) {
    throw new Error(`collectMarketSample: expected ${marketDays} market days, got ${n}`);
  }

  return {
    days,
    phases,
    worldPrice,
    worldTotalReturn,
    stockReturns,
    dividendSum,
    closeSum,
  };
}
