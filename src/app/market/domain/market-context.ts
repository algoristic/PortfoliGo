import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';

import { detExp, detLog } from '@app/simulation/util/det-math';

import { StreamFamily } from '@app/simulation/util/random-stream';

import { SeedKey } from '@app/simulation/util/seed';

import { World } from '@app/world/domain/models/world.model';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createEtfLayout, EtfLayout } from './etf-layout';
import { createIndexLayout, IndexLayout } from './index-layout';
import { createMarketLayout, MarketLayout } from './market-layout';
import { MARKET_PHASES, MarketConfig, MarketPhase } from './models/market-config.model';
import { createSpreadLayout, SpreadLayout } from './quote-logic';

export const MARKET_PHASE_COUNT = MARKET_PHASES.length;

/** Everything the day step needs besides the state, derived once per world and configuration. */
export interface MarketContext {
  seedKey: SeedKey;
  layout: MarketLayout;
  indices: IndexLayout;
  etfs: EtfLayout;
  spreads: SpreadLayout;
  config: MarketConfig;
  /** Length of a trading day in years (Δ_T) and its square root. */
  dayYears: number;
  sqrtDayYears: number;
  /** Length of the intervals between two boundaries in years (Δ_j) and their square roots. */
  intervalYears: Float64Array;
  sqrtIntervalYears: Float64Array;
  /** Per factor and phase (`k · MARKET_PHASE_COUNT + p`): trend target and log volatility target. */
  trendTargets: Float64Array;
  logVolTargets: Float64Array;
  /** Per factor: κ_m, η, κ_s, ξ, ρ and √(1 − ρ²). */
  trendReversion: Float64Array;
  trendVol: Float64Array;
  volReversion: Float64Array;
  volOfVol: Float64Array;
  leverage: Float64Array;
  leverageComplement: Float64Array;
  /** Per phase: daily probability to leave it and weights of the next phase. */
  phaseLeaveProbability: Float64Array;
  phaseNextWeights: readonly (readonly number[])[];
  /** Day streams `market/regime/<day>`, `market/factor/<id>/<day>`, `market/instrument/<id>/<day>`. */
  regimeStreams: StreamFamily;
  factorStreams: readonly StreamFamily[];
  instrumentStreams: readonly StreamFamily[];
  /** Day stream `market/etfs/<day>` for the tracking noise of all ETFs. */
  etfStreams: StreamFamily;
  /** Expected jumps per trading day (λ_i · Δ_T) and `exp(−λ_i · Δ_T)` per instrument. */
  dailyJumpRate: Float64Array;
  noJumpProbability: Float64Array;
  /** √(overnight share) and √(1 − overnight share) of the idiosyncratic variance. */
  sqrtOvernightShare: number;
  sqrtSessionShare: number;
}

export function phaseIndex(phase: MarketPhase): number {
  return MARKET_PHASES.indexOf(phase);
}

export function createMarketContext(
  seedKey: SeedKey,
  world: World,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): MarketContext {
  const layout = createMarketLayout(world);
  const factorCount = layout.factorIds.length;
  const yearMinutes = config.tradingDaysPerYear * MINUTES_PER_DAY;
  const intervalCount = layout.boundaries.length - 1;
  const intervalYears = new Float64Array(intervalCount);
  const sqrtIntervalYears = new Float64Array(intervalCount);
  for (let j = 0; j < intervalCount; j++) {
    intervalYears[j] = (layout.boundaries[j + 1] - layout.boundaries[j]) / yearMinutes;
    sqrtIntervalYears[j] = Math.sqrt(intervalYears[j]);
  }

  const reference = config.phases[config.referencePhase];
  const dayYears = 1 / config.tradingDaysPerYear;
  const indices = createIndexLayout(world, layout);
  const context: MarketContext = {
    seedKey,
    layout,
    indices,
    etfs: createEtfLayout(world, layout, indices, config),
    spreads: createSpreadLayout(world, config),
    config,
    dayYears,
    sqrtDayYears: Math.sqrt(dayYears),
    intervalYears,
    sqrtIntervalYears,
    trendTargets: new Float64Array(factorCount * MARKET_PHASE_COUNT),
    logVolTargets: new Float64Array(factorCount * MARKET_PHASE_COUNT),
    trendReversion: new Float64Array(factorCount),
    trendVol: new Float64Array(factorCount),
    volReversion: new Float64Array(factorCount),
    volOfVol: new Float64Array(factorCount),
    leverage: new Float64Array(factorCount),
    leverageComplement: new Float64Array(factorCount),
    phaseLeaveProbability: Float64Array.from(
      MARKET_PHASES.map(
        (phase) => 1 / (config.phases[phase].meanDuration * config.tradingDaysPerYear),
      ),
    ),
    phaseNextWeights: MARKET_PHASES.map((phase) =>
      MARKET_PHASES.map((next) => (next === phase ? 0 : config.phases[phase].next[next])),
    ),
    regimeStreams: new StreamFamily(seedKey, 'market/regime/'),
    factorStreams: layout.factorIds.map((id) => new StreamFamily(seedKey, `market/factor/${id}/`)),
    instrumentStreams: layout.instrumentIds.map(
      (id) => new StreamFamily(seedKey, `market/instrument/${id}/`),
    ),
    etfStreams: new StreamFamily(seedKey, 'market/etfs/'),
    dailyJumpRate: layout.jumpIntensity.map((lambda) => lambda * dayYears),
    noJumpProbability: layout.jumpIntensity.map((lambda) => detExp(-(lambda * dayYears))),
    sqrtOvernightShare: Math.sqrt(config.overnightShare),
    sqrtSessionShare: Math.sqrt(1 - config.overnightShare),
  };

  for (let k = 0; k < factorCount; k++) {
    const params = config.factors[layout.factorKinds[k]];
    context.trendReversion[k] = params.trendReversion;
    context.trendVol[k] = params.trendVol;
    context.volReversion[k] = params.volReversion;
    context.volOfVol[k] = params.volOfVol;
    context.leverage[k] = params.leverage;
    context.leverageComplement[k] = Math.sqrt(1 - params.leverage * params.leverage);
    MARKET_PHASES.forEach((phase, p) => {
      const target = config.phases[phase];
      const coupling = params.phaseCoupling;
      context.trendTargets[k * MARKET_PHASE_COUNT + p] =
        params.trendTarget + coupling * (target.trendTarget - reference.trendTarget);
      context.logVolTargets[k * MARKET_PHASE_COUNT + p] = detLog(
        params.volTarget * (1 + coupling * (target.volTarget / reference.volTarget - 1)),
      );
    });
  }
  return context;
}
