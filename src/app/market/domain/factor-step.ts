import { detExp } from '@app/simulation/util/det-math';

import { normal, weightedIndex } from '@app/simulation/util/distributions';

import { createStream } from '@app/simulation/util/random-stream';

import { MARKET_PHASE_COUNT, MarketContext, phaseIndex } from './market-context';
import { MARKET_PHASES, MarketPhase } from './models/market-config.model';
import { MarketDay } from './models/market-day.model';

/** Factor part of the state that the day step advances. */
export interface FactorState {
  phase: MarketPhase;
  trend: Float64Array;
  logVol: Float64Array;
  level: Float64Array;
}

/**
 * Daily transition of the market phase (TS §6.3) from the stream `market/regime/<day>`.
 * Draw order: one uniform for leaving, then the weighted choice of the next phase.
 */
export function stepPhase(context: MarketContext, phase: MarketPhase, day: number): MarketPhase {
  const rng = context.regimeStreams.create(day);
  const p = phaseIndex(phase);
  if (rng.nextFloat53() >= context.phaseLeaveProbability[p]) {
    return phase;
  }
  return MARKET_PHASES[weightedIndex(rng, context.phaseNextWeights[p])];
}

/**
 * Day step of all factors (TS §6.2) after the phase transition: trend, support points at the
 * boundaries, volatility of the next day. Writes the support points and today's volatility into
 * `out`. Each factor draws from its own stream `market/factor/<id>/<day>` in the order: trend,
 * one normal per interval, volatility.
 */
export function stepFactors(
  context: MarketContext,
  state: FactorState,
  day: number,
  out: MarketDay,
): void {
  const { layout, dayYears, sqrtDayYears, intervalYears, sqrtIntervalYears } = context;
  const boundaryCount = layout.boundaries.length;
  const intervalCount = boundaryCount - 1;
  const p = phaseIndex(state.phase);
  for (let k = 0; k < layout.factorIds.length; k++) {
    const rng = context.factorStreams[k].create(day);

    const trendTarget = context.trendTargets[k * MARKET_PHASE_COUNT + p];
    let trend = state.trend[k];
    trend +=
      context.trendReversion[k] * (trendTarget - trend) * dayYears +
      context.trendVol[k] * sqrtDayYears * normal(rng);
    state.trend[k] = trend;

    const logVol = state.logVol[k];
    const vol = detExp(logVol);
    const drift = trend - 0.5 * vol * vol;
    const base = k * boundaryCount;
    let level = state.level[k];
    let shock = 0;
    out.factorLevels[base] = level;
    for (let j = 0; j < intervalCount; j++) {
      const z = normal(rng);
      level += drift * intervalYears[j] + vol * sqrtIntervalYears[j] * z;
      shock += sqrtIntervalYears[j] * z;
      out.factorLevels[base + j + 1] = level;
    }
    state.level[k] = level;
    out.factorVols[k] = vol;

    const standardizedReturn = shock / sqrtDayYears;
    const logVolTarget = context.logVolTargets[k * MARKET_PHASE_COUNT + p];
    state.logVol[k] =
      logVol +
      context.volReversion[k] * (logVolTarget - logVol) * dayYears +
      context.volOfVol[k] *
        sqrtDayYears *
        (context.leverage[k] * standardizedReturn + context.leverageComplement[k] * normal(rng));
  }
}

/**
 * Factor state at the epoch: reference phase, flat levels and trend and log volatility drawn from
 * their stationary distributions around the targets (stream `market/factor/<id>/init`).
 */
export function initialFactorState(context: MarketContext): FactorState {
  const { layout, config } = context;
  const count = layout.factorIds.length;
  const phase = config.referencePhase;
  const p = phaseIndex(phase);
  const state: FactorState = {
    phase,
    trend: new Float64Array(count),
    logVol: new Float64Array(count),
    level: new Float64Array(count),
  };
  for (let k = 0; k < count; k++) {
    const rng = createStream(context.seedKey, `market/factor/${layout.factorIds[k]}/init`);
    const trendSd = context.trendVol[k] / Math.sqrt(2 * context.trendReversion[k]);
    const logVolSd = context.volOfVol[k] / Math.sqrt(2 * context.volReversion[k]);
    state.trend[k] = normal(rng, context.trendTargets[k * MARKET_PHASE_COUNT + p], trendSd);
    state.logVol[k] = normal(rng, context.logVolTargets[k * MARKET_PHASE_COUNT + p], logVolSd);
  }
  return state;
}
