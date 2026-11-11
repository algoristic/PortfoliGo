import { exDayOnOrAfter } from './dividend-logic';
import { FactorState, initialFactorState, stepFactors, stepPhase } from './factor-step';
import { stepIndices } from './index-step';
import { stepInstrument } from './instrument-step';
import { isMarketDay, isMonthStartDay } from './market-calendar';
import { MarketContext } from './market-context';
import { snapshotMarket } from './market-snapshot';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, MarketState } from './models/market-state.model';

const INITIAL_JUMP_CAPACITY = 16;

export interface AdvanceMarketOptions {
  /** Called after every trading day; `day` is reused and only valid during the call. */
  onDay?: (day: Readonly<MarketDay>) => void;
  /** Receives the market state at every month start that is passed (TS §6.8). */
  history?: FactorHistory;
}

export function createMarketDay(context: MarketContext): MarketDay {
  const { layout } = context;
  const factorCount = layout.factorIds.length;
  const instrumentCount = layout.instrumentIds.length;
  return {
    day: -1,
    phase: 'normal',
    factorLevels: new Float64Array(factorCount * layout.boundaries.length),
    factorVols: new Float64Array(factorCount),
    idioOpen: new Float64Array(instrumentCount),
    idioClose: new Float64Array(instrumentCount),
    prevLogClose: new Float64Array(instrumentCount),
    logOpen: new Float64Array(instrumentCount),
    logClose: new Float64Array(instrumentCount),
    jumpStart: new Int32Array(instrumentCount),
    jumpCount: new Int32Array(instrumentCount),
    jumpMinute: new Int32Array(INITIAL_JUMP_CAPACITY),
    jumpSize: new Float64Array(INITIAL_JUMP_CAPACITY),
    jumpTotal: 0,
    exDividendCents: new Float64Array(instrumentCount),
    announcedCents: new Float64Array(instrumentCount),
    announcedExDay: new Int32Array(instrumentCount).fill(-1),
    indexReinvest: new Float64Array(context.indices.ids.length * layout.boundaries.length).fill(1),
  };
}

/** Copy of a market day that shares no arrays with the original; jump arrays are trimmed. */
export function copyMarketDay(day: Readonly<MarketDay>): MarketDay {
  return {
    day: day.day,
    phase: day.phase,
    factorLevels: day.factorLevels.slice(),
    factorVols: day.factorVols.slice(),
    idioOpen: day.idioOpen.slice(),
    idioClose: day.idioClose.slice(),
    prevLogClose: day.prevLogClose.slice(),
    logOpen: day.logOpen.slice(),
    logClose: day.logClose.slice(),
    jumpStart: day.jumpStart.slice(),
    jumpCount: day.jumpCount.slice(),
    jumpMinute: day.jumpMinute.slice(0, day.jumpTotal),
    jumpSize: day.jumpSize.slice(0, day.jumpTotal),
    jumpTotal: day.jumpTotal,
    exDividendCents: day.exDividendCents.slice(),
    announcedCents: day.announcedCents.slice(),
    announcedExDay: day.announcedExDay.slice(),
    indexReinvest: day.indexReinvest.slice(),
  };
}

/**
 * Market state at the epoch (day 0): factors from `initialFactorState`, `U_i = 0`, the start
 * prices as last closes, the first ex-dates and `R = 1`.
 */
export function createMarketState(context: MarketContext): MarketState {
  const { layout } = context;
  const count = layout.instrumentIds.length;
  return {
    day: 0,
    ...initialFactorState(context),
    idioClose: new Float64Array(count),
    logClose: layout.logBase.slice(),
    nextExDay: Int32Array.from(layout.dividends, (dividend) =>
      dividend === null ? -1 : exDayOnOrAfter(dividend.schedule, dividend.frequency, 0),
    ),
    dividendCents: new Float64Array(count).fill(Number.NaN),
    indexReinvest: new Float64Array(context.indices.ids.length).fill(1),
  };
}

/**
 * Day step for the trading day `state.day` (TS §6.1): market phase, factors, all instruments, then
 * the indices. Writes the support points into `out` and advances the state to the next day.
 */
export function stepMarketDay(context: MarketContext, state: MarketState, out: MarketDay): void {
  const day = state.day;
  stepFactorDay(context, state, day, out);
  for (let i = 0; i < context.layout.instrumentIds.length; i++) {
    stepInstrument(context, i, day, state, out);
  }
  stepIndices(context, state, out);
  state.day = day + 1;
}

/** Phase and factor part of the day step; also used to recompute factor days from the history. */
export function stepFactorDay(
  context: MarketContext,
  state: FactorState,
  day: number,
  out: MarketDay,
): void {
  state.phase = stepPhase(context, state.phase, day);
  out.day = day;
  out.phase = state.phase;
  out.jumpTotal = 0;
  stepFactors(context, state, day, out);
}

/**
 * Runs the day steps of all market days from `state.day` up to, but excluding, `toDay`. Weekends
 * leave the state unchanged: the level at Friday 24:00 is the level at Monday 00:00.
 */
export function advanceMarket(
  context: MarketContext,
  state: MarketState,
  toDay: number,
  options: AdvanceMarketOptions = {},
  out: MarketDay = createMarketDay(context),
): void {
  while (state.day < toDay) {
    const day = state.day;
    if (options.history !== undefined && isMonthStartDay(day)) {
      recordMonthStart(options.history, state);
    }
    if (isMarketDay(day)) {
      stepMarketDay(context, state, out);
      options.onDay?.(out);
    } else {
      state.day = day + 1;
    }
  }
}

function recordMonthStart(history: FactorHistory, state: MarketState): void {
  const last = history.monthStarts[history.monthStarts.length - 1];
  if (last !== undefined && last.day >= state.day) {
    return;
  }
  history.monthStarts.push(snapshotMarket(state));
}
