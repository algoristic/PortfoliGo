import { createIndicatorTracker, indicatorLineCount } from '@app/analysis/domain/indicator-logic';
import {
  IndicatorPoint,
  IndicatorSpec,
  IndicatorTracker,
} from '@app/analysis/domain/models/indicator.model';

import { Candle } from './models/candle.model';
import { IndicatorLinePoint, IndicatorLines } from './models/chart.model';

/**
 * How `next` continues `previous` (the same array objects before the newest candle): the newest
 * candle changed and/or one new candle follows it. `null` for any other change (new data set,
 * prepended candles), which needs a full computation.
 */
export interface CandleTailChange {
  /** The newest candle of `previous` in its new state, if it changed. */
  replaced: Candle | null;
  appended: Candle | null;
}

export function candleTailChange(
  previous: readonly Candle[],
  next: readonly Candle[],
): CandleTailChange | null {
  const last = previous.length - 1;
  if (last < 0 || (next.length !== previous.length && next.length !== previous.length + 1)) {
    return null;
  }
  for (let index = 0; index < last; index++) {
    if (previous[index] !== next[index]) {
      return null;
    }
  }
  if (next[last].tick !== previous[last].tick) {
    return null;
  }
  return {
    replaced: next[last] === previous[last] ? null : next[last],
    appended: next[last + 1] ?? null,
  };
}

function emptyLines(spec: IndicatorSpec): IndicatorLinePoint[][] {
  return Array.from({ length: indicatorLineCount(spec) }, () => []);
}

/**
 * One indicator over the closes of the shown candles (TS §11.7). A changed newest candle or one new
 * candle at the end only continue the tracker (`replaceLast`, `push`), so a live update costs one
 * step instead of the whole series; every other change computes the series again. The lines are new
 * arrays after every change, so the chart sees what changed.
 */
export class ChartIndicatorSeries {
  readonly spec: IndicatorSpec;
  #tracker: IndicatorTracker;
  #candles: readonly Candle[] = [];
  #lines: IndicatorLines;

  constructor(spec: IndicatorSpec) {
    this.spec = spec;
    this.#tracker = createIndicatorTracker(spec);
    this.#lines = emptyLines(spec);
  }

  update(candles: readonly Candle[]): IndicatorLines {
    const change = candleTailChange(this.#candles, candles);
    this.#candles = candles;
    if (change === null) {
      this.#tracker = createIndicatorTracker(this.spec);
      const lines = emptyLines(this.spec);
      for (const candle of candles) {
        addPoint(lines, candle, this.#tracker.push(candle.close));
      }
      this.#lines = lines;
      return lines;
    }
    if (change.replaced !== null) {
      const { replaced } = change;
      const point = this.#tracker.replaceLast(replaced.close);
      if (point !== null) {
        this.#lines = this.#lines.map((line, index) => [
          ...line.slice(0, -1),
          { tick: replaced.tick, value: point[index] },
        ]);
      }
    }
    if (change.appended !== null) {
      const { appended } = change;
      const point = this.#tracker.push(appended.close);
      if (point !== null) {
        this.#lines = this.#lines.map((line, index) => [
          ...line,
          { tick: appended.tick, value: point[index] },
        ]);
      }
    }
    return this.#lines;
  }
}

function addPoint(
  lines: IndicatorLinePoint[][],
  candle: Candle,
  point: IndicatorPoint | null,
): void {
  if (point !== null) {
    lines.forEach((line, index) => line.push({ tick: candle.tick, value: point[index] }));
  }
}

/** An indicator of the chart by its id. */
export interface ChartIndicatorInput {
  id: string;
  spec: IndicatorSpec;
}

/**
 * The lines of all chosen indicators by id, each continued incrementally. A changed spec starts its
 * series again; removed indicators are dropped.
 */
export class ChartIndicatorSet {
  readonly #series = new Map<string, ChartIndicatorSeries>();

  update(
    candles: readonly Candle[],
    indicators: readonly ChartIndicatorInput[],
  ): ReadonlyMap<string, IndicatorLines> {
    const result = new Map<string, IndicatorLines>();
    for (const { id, spec } of indicators) {
      let series = this.#series.get(id);
      if (series === undefined || !sameSpec(series.spec, spec)) {
        series = new ChartIndicatorSeries(spec);
        this.#series.set(id, series);
      }
      result.set(id, series.update(candles));
    }
    for (const id of [...this.#series.keys()]) {
      if (!result.has(id)) {
        this.#series.delete(id);
      }
    }
    return result;
  }
}

function sameSpec(a: IndicatorSpec, b: IndicatorSpec): boolean {
  return (
    a.kind === b.kind &&
    a.period === b.period &&
    (a.kind === 'bollinger' ? b.kind === 'bollinger' && a.multiplier === b.multiplier : true)
  );
}
