import { detExp, detLog } from '@app/simulation/util/det-math';

import { StreamFamily } from '@app/simulation/util/random-stream';

import { SeedKey } from '@app/simulation/util/seed';

import { DIVIDENDS_PER_YEAR, RegionId } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createEtfLayout, EtfLayout } from './etf-layout';
import {
  cumulativeDividendDrag,
  decayWeight,
  dividendDrag,
  dividendDragAt,
  expectedLogPath,
  idioVariance,
  yieldFromDrag,
} from './idio-path-logic';
import { createIndexLayout, IndexLayout } from './index-layout';
import { marketDaysBefore } from './market-calendar';
import {
  createMarketLayout,
  factorId,
  LOADINGS_PER_INSTRUMENT,
  MarketLayout,
  WORLD_FACTOR,
} from './market-layout';
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
  /**
   * Share of the trading day's factor variance per factor and interval between two boundaries in
   * years (`Δ_kj` at `k · intervals + j`, weighted by activity, E-24, E-30; `Σ_j Δ_kj = Δ_T`) and
   * their square roots. Region factors follow the sessions of their region, all others the
   * activity of all exchanges.
   */
  intervalYears: Float64Array;
  sqrtIntervalYears: Float64Array;
  /** Per factor and phase (`k · MARKET_PHASE_COUNT + p`): trend target and log volatility target. */
  trendTargets: Float64Array;
  logVolTargets: Float64Array;
  /**
   * Per factor (TS §6.2, E-22): reversion speed θ_k of the level, the share `1 − e^{−θ_k·Δ_T}` of the
   * deviation from the expected path that the level loses per day, and the trend target m̄_k and
   * the variance s̄_k² of the reference phase that define the path.
   */
  levelReversion: Float64Array;
  levelDecay: Float64Array;
  referenceTrend: Float64Array;
  referenceVariance: Float64Array;
  /** Expected level path of the factors for the last requested day (`factorPathAt`). */
  factorPath: FactorPathDay;
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
  /**
   * Per instrument: idiosyncratic variance `v_i`, zero-beta drift `(1 − β_i) · r_z` (E-32) and
   * `λ_i · Δ_T · μ_J`.
   */
  idioVariance: Float64Array;
  zeroBetaDrift: Float64Array;
  jumpDrift: Float64Array;
  /**
   * Dividend lifecycle per instrument (TS §6.5, E-33): years `t_0` of market days before the start
   * of the payments (`Infinity` without a dividend), expected log markdown p. a. at the start and in
   * the long run.
   */
  dividendStartYears: Float64Array;
  startDrag: Float64Array;
  longRunDrag: Float64Array;
  /** Share `1 − e^{−θ·Δ_T}` of the deviation from the expected path that `U_i` loses per day. */
  reversionDecay: number;
  /** Volatility target of the world factor in the reference phase (`s̄_world`, E-23). */
  referenceWorldVol: number;
  /** Time and variance weights of the expected path for the last requested day (`idioPathAt`). */
  idioPath: IdioPathDay;
}

/** Expected level path of every factor around one day step (TS §6.2, E-22). */
export interface FactorPathDay {
  day: number;
  /** Expected level `p_k(t) = m̄_k·t − ½·s̄_k²·g_k(t)` at the start of the day. */
  target: Float64Array;
  /** `(g_k(t + Δ_T) − g_k(t)) / Δ_T`: share of the convexity drift `−½·s_k²` of this day; 1 without reversion. */
  convexity: Float64Array;
}

/** Expected path of `U_i` around one day step (TS §6.4); the same for all instruments. */
export interface IdioPathDay {
  day: number;
  /** Years `t` of market days before the day. */
  years: number;
  /** Alpha weights `h(t)`, `h(t + Δ_T)` and variance weights `g(t)`, `g(t + Δ_T)`. */
  alphaBefore: number;
  alphaAfter: number;
  varianceBefore: number;
  varianceAfter: number;
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
  const reference = config.phases[config.referencePhase];
  const dayYears = 1 / config.tradingDaysPerYear;
  const intervalYears = factorIntervalYears(world, layout, config, dayYears);
  const sqrtIntervalYears = intervalYears.map((years) => Math.sqrt(years));
  const lifecycle = config.dividendLifecycle;
  const theta = config.idioReversion;
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
    levelReversion: new Float64Array(factorCount),
    levelDecay: new Float64Array(factorCount),
    referenceTrend: new Float64Array(factorCount),
    referenceVariance: new Float64Array(factorCount),
    factorPath: {
      day: -1,
      target: new Float64Array(factorCount),
      convexity: new Float64Array(factorCount),
    },
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
    idioVariance: layout.idioVol.map((vol, i) =>
      idioVariance(vol, layout.jumpIntensity[i], layout.jumpMean[i], layout.jumpSd[i]),
    ),
    zeroBetaDrift: Float64Array.from(
      layout.instrumentIds,
      (_, i) =>
        (1 - layout.loadings[i * LOADINGS_PER_INSTRUMENT + WORLD_FACTOR]) * config.zeroBetaReturn,
    ),
    jumpDrift: layout.jumpIntensity.map((lambda, i) => lambda * dayYears * layout.jumpMean[i]),
    dividendStartYears: Float64Array.from(layout.dividends, (dividend) =>
      dividend === null ? Infinity : marketDaysBefore(dividend.startDay) * dayYears,
    ),
    startDrag: Float64Array.from(layout.dividends, (dividend) =>
      dividend === null
        ? 0
        : dividendDrag(
            dividend.yield > 0 ? dividend.yield : lifecycle.initialYield,
            DIVIDENDS_PER_YEAR[dividend.frequency],
          ),
    ),
    longRunDrag: Float64Array.from(layout.dividends, (dividend) =>
      dividend === null
        ? 0
        : dividendDrag(lifecycle.longRunYield, DIVIDENDS_PER_YEAR[dividend.frequency]),
    ),
    reversionDecay: 1 - detExp(-theta * dayYears),
    referenceWorldVol: 0,
    idioPath: {
      day: -1,
      years: 0,
      alphaBefore: 0,
      alphaAfter: 0,
      varianceBefore: 0,
      varianceAfter: 0,
    },
  };

  for (let k = 0; k < factorCount; k++) {
    const params = config.factors[layout.factorKinds[k]];
    context.trendReversion[k] = params.trendReversion;
    context.trendVol[k] = params.trendVol;
    context.volReversion[k] = params.volReversion;
    context.volOfVol[k] = params.volOfVol;
    context.leverage[k] = params.leverage;
    context.leverageComplement[k] = Math.sqrt(1 - params.leverage * params.leverage);
    context.levelReversion[k] = params.levelReversion;
    context.levelDecay[k] = 1 - detExp(-params.levelReversion * dayYears);
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
  const referenceIndex = phaseIndex(config.referencePhase);
  for (let k = 0; k < factorCount; k++) {
    const vol = detExp(context.logVolTargets[k * MARKET_PHASE_COUNT + referenceIndex]);
    context.referenceTrend[k] = context.trendTargets[k * MARKET_PHASE_COUNT + referenceIndex];
    context.referenceVariance[k] = vol * vol;
  }
  context.referenceWorldVol = detExp(
    context.logVolTargets[WORLD_FACTOR * MARKET_PHASE_COUNT + referenceIndex],
  );
  return context;
}

/**
 * Expected level path of the factors for the day step of `day` (TS §6.2, E-22); cached for the
 * last day. Factors without reversion follow their drift unchanged: convexity 1, no target.
 */
export function factorPathAt(context: MarketContext, day: number): FactorPathDay {
  const path = context.factorPath;
  if (path.day !== day) {
    const years = marketDaysBefore(day) * context.dayYears;
    for (let k = 0; k < path.target.length; k++) {
      const theta = context.levelReversion[k];
      if (theta === 0) {
        path.target[k] = 0;
        path.convexity[k] = 1;
        continue;
      }
      const before = decayWeight(2 * theta, years);
      const after = decayWeight(2 * theta, years + context.dayYears);
      path.target[k] = expectedLogPath(
        0,
        0,
        context.referenceTrend[k],
        years,
        context.referenceVariance[k],
        before,
      );
      path.convexity[k] = (after - before) / context.dayYears;
    }
    path.day = day;
  }
  return path;
}

/**
 * Expected path of `U_i` for the day step of `day` (TS §6.4); cached for the last day, because all
 * instruments of a day step share it.
 */
export function idioPathAt(context: MarketContext, day: number): IdioPathDay {
  const path = context.idioPath;
  if (path.day !== day) {
    const { idioReversion, alphaDecay } = context.config;
    const years = marketDaysBefore(day) * context.dayYears;
    const after = years + context.dayYears;
    path.day = day;
    path.years = years;
    path.alphaBefore = decayWeight(alphaDecay, years);
    path.alphaAfter = decayWeight(alphaDecay, after);
    path.varianceBefore = decayWeight(2 * idioReversion, years);
    path.varianceAfter = decayWeight(2 * idioReversion, after);
  }
  return path;
}

/**
 * Target `μ_i(t) = m_i(t) − D_i(t − t_0)` of the return of `U_i` at the start of the day of `path`
 * (TS §6.4, §6.5): expected path with decaying alpha, zero-beta drift and compensator, minus the
 * expected log markdown of the dividends paid so far (E-22, E-32, E-33).
 */
export function idioTargetAt(context: MarketContext, i: number, path: IdioPathDay): number {
  const expected = expectedLogPath(
    context.layout.alpha[i],
    path.alphaBefore,
    context.zeroBetaDrift[i],
    path.years,
    context.idioVariance[i],
    path.varianceBefore,
  );
  return (
    expected -
    cumulativeDividendDrag(
      context.startDrag[i],
      context.longRunDrag[i],
      context.config.dividendLifecycle.yieldReversion,
      path.years - context.dividendStartYears[i],
    )
  );
}

/**
 * Target dividend yield of instrument i after `years` of market days (TS §6.5, E-33); the start
 * yield until the payments start, 0 without a dividend.
 */
export function dividendYieldAt(context: MarketContext, i: number, years: number): number {
  const dividend = context.layout.dividends[i];
  if (dividend === null) {
    return 0;
  }
  const drag = dividendDragAt(
    context.startDrag[i],
    context.longRunDrag[i],
    context.config.dividendLifecycle.yieldReversion,
    Math.max(0, years - context.dividendStartYears[i]),
  );
  return yieldFromDrag(drag, DIVIDENDS_PER_YEAR[dividend.frequency]);
}

/**
 * Factor variance per interval in years (TS §6.2, E-24): activity `a = c + (1 − c) · s` per minute,
 * where `s` is the activity weight of the open exchanges relative to all exchanges, normalised so
 * that the intervals add up to one trading day. `c = 1` gives the plain interval lengths.
 *
 * With `regionId` (E-30) only the exchanges of that region count and `c` is
 * `regionClosedActivity`: the profile of the region factor.
 */
export function activityIntervalYears(
  world: World,
  layout: MarketLayout,
  config: Pick<MarketConfig, 'closedActivity' | 'regionClosedActivity' | 'exchangeActivity'>,
  dayYears: number,
  regionId?: RegionId,
): Float64Array {
  const { boundaries } = layout;
  const intervalCount = boundaries.length - 1;
  const openWeight = new Float64Array(intervalCount);
  const regionOf = new Map(world.countries.map((country) => [country.id, country.regionId]));
  let totalWeight = 0;
  for (const exchange of world.exchanges) {
    if (regionId !== undefined && regionOf.get(exchange.countryId) !== regionId) {
      continue;
    }
    const weight = config.exchangeActivity[exchange.id] ?? 0;
    totalWeight += weight;
    for (let j = 0; j < intervalCount; j++) {
      if (boundaries[j] >= exchange.open && boundaries[j + 1] <= exchange.close) {
        openWeight[j] += weight;
      }
    }
  }
  const closed = regionId === undefined ? config.closedActivity : config.regionClosedActivity;
  const weights = new Float64Array(intervalCount);
  let total = 0;
  for (let j = 0; j < intervalCount; j++) {
    const openShare = totalWeight > 0 ? openWeight[j] / totalWeight : 0;
    weights[j] = (boundaries[j + 1] - boundaries[j]) * (closed + (1 - closed) * openShare);
    total += weights[j];
  }
  return weights.map((weight) => (dayYears * weight) / total);
}

/**
 * Interval years of every factor at `k · intervals + j` (TS §6.2, E-30): region factors get the
 * profile of their region, all other factors the profile of all exchanges.
 */
function factorIntervalYears(
  world: World,
  layout: MarketLayout,
  config: MarketConfig,
  dayYears: number,
): Float64Array {
  const intervalCount = layout.boundaries.length - 1;
  const common = activityIntervalYears(world, layout, config, dayYears);
  const regional = new Map(
    world.regions.map((region) => [
      factorId('region', region.id),
      activityIntervalYears(world, layout, config, dayYears, region.id),
    ]),
  );
  const result = new Float64Array(layout.factorIds.length * intervalCount);
  layout.factorIds.forEach((id, k) => {
    result.set(regional.get(id) ?? common, k * intervalCount);
  });
  return result;
}
