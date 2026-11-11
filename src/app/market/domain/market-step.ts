import { FactorState, initialFactorState, stepFactors, stepPhase } from './factor-step';
import { stepInstrument } from './instrument-step';
import { MarketContext } from './market-context';
import { MarketLayout } from './market-layout';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, MarketState } from './models/market-state.model';

import { dayStartTick, tickToDateTime, weekdayOfDay } from '../../clock/domain/calendar-logic';
import { SATURDAY } from '../../clock/domain/models/time.model';

const INITIAL_JUMP_CAPACITY = 16;

export interface AdvanceMarketOptions {
  /** Called after every trading day; `day` is reused and only valid during the call. */
  onDay?: (day: Readonly<MarketDay>) => void;
  /** Receives the factor state at every month start that is passed (TS §6.8). */
  history?: FactorHistory;
}

/** Market days are weekdays; holidays follow in stage 2 (TS §3.3). */
export function isMarketDay(day: number): boolean {
  return weekdayOfDay(day) < SATURDAY;
}

export function isMonthStartDay(day: number): boolean {
  return tickToDateTime(dayStartTick(day)).day === 1;
}

export function createMarketDay(layout: MarketLayout): MarketDay {
  const factorCount = layout.factorIds.length;
  const instrumentCount = layout.instrumentIds.length;
  return {
    day: -1,
    phase: 'normal',
    factorLevels: new Float64Array(factorCount * layout.boundaries.length),
    factorVols: new Float64Array(factorCount),
    idioOpen: new Float64Array(instrumentCount),
    idioClose: new Float64Array(instrumentCount),
    logOpen: new Float64Array(instrumentCount),
    logClose: new Float64Array(instrumentCount),
    jumpStart: new Int32Array(instrumentCount),
    jumpCount: new Int32Array(instrumentCount),
    jumpMinute: new Int32Array(INITIAL_JUMP_CAPACITY),
    jumpSize: new Float64Array(INITIAL_JUMP_CAPACITY),
    jumpTotal: 0,
  };
}

/** Market state at the epoch (day 0): factors from `initialFactorState`, `U_i = 0`. */
export function createMarketState(context: MarketContext): MarketState {
  return {
    day: 0,
    ...initialFactorState(context),
    idioClose: new Float64Array(context.layout.instrumentIds.length),
  };
}

/**
 * Day step for the trading day `state.day` (TS §6.1): market phase, factors, then all instruments.
 * Writes the support points into `out` and advances the state to the next day.
 */
export function stepMarketDay(context: MarketContext, state: MarketState, out: MarketDay): void {
  const day = state.day;
  stepFactorDay(context, state, day, out);
  for (let i = 0; i < context.layout.instrumentIds.length; i++) {
    state.idioClose[i] = stepInstrument(context, i, day, state.idioClose[i], out);
  }
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
  out: MarketDay = createMarketDay(context.layout),
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
  history.monthStarts.push({
    day: state.day,
    phase: state.phase,
    trend: state.trend.slice(),
    logVol: state.logVol.slice(),
    level: state.level.slice(),
  });
}
