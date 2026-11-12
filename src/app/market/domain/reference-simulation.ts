import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { normal } from '@app/simulation/util/distributions';
import { createStream } from '@app/simulation/util/random-stream';

import { profileWeights } from './bridge-logic';
import { expectedLogPath } from './idio-path-logic';
import { factorPathAt, idioPathAt, MarketContext } from './market-context';
import { LOADINGS_PER_INSTRUMENT } from './market-layout';
import { MarketDay } from './models/market-day.model';
import { priceFromLog } from './price-logic';

/**
 * Independent reference for the bridge model (TS §4.6, §6.1): simulates the factors and the
 * idiosyncratic components of the given instruments minute by minute with the parameters of the
 * day step (trend and volatility of each factor per day, return of the level to its path,
 * activity weights of the intervals) and
 * the intraday profile of the idiosyncratic variance. `U_i` follows the drift of the day step
 * (expected path and return to it, spread evenly over the session). Jumps occur in each session
 * minute with probability `λ / (261 · L)`.
 * The instruments must share their trading hours. Used by the lab (TS §14.2) and the
 * calibration suite; its streams (`lab/reference/…`) never feed back into the market.
 */
export class ReferenceSimulation {
  readonly #context: MarketContext;
  readonly #instruments: readonly number[];
  readonly #factors: readonly number[];
  readonly #level: Float64Array;
  readonly #idio: Float64Array;
  readonly #open: number;
  readonly #close: number;
  /** Share of the idiosyncratic session variance per step from minute j to j + 1. */
  readonly #minuteShare: Float64Array;
  /** Factor variance in years per minute of the day, from the activity weights (E-24). */
  readonly #minuteYears: Float64Array;

  constructor(context: MarketContext, instruments: readonly number[]) {
    const { layout } = context;
    if (instruments.length === 0) {
      throw new RangeError('ReferenceSimulation: no instruments');
    }
    this.#context = context;
    this.#instruments = instruments;
    const factors = new Set<number>();
    for (const i of instruments) {
      for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
        factors.add(layout.loadingFactors[i * LOADINGS_PER_INSTRUMENT + l]);
      }
    }
    this.#factors = [...factors].sort((a, b) => a - b);
    this.#level = new Float64Array(layout.factorIds.length);
    this.#idio = new Float64Array(layout.instrumentIds.length);
    this.#open = layout.boundaries[layout.openBoundary[instruments[0]]];
    this.#close = layout.boundaries[layout.closeBoundary[instruments[0]]];
    for (const i of instruments) {
      if (
        layout.boundaries[layout.openBoundary[i]] !== this.#open ||
        layout.boundaries[layout.closeBoundary[i]] !== this.#close
      ) {
        throw new Error('ReferenceSimulation: the instruments need the same trading hours');
      }
    }
    const weights = profileWeights(context.config.intradayVolProfile, this.#close - this.#open);
    let total = 0;
    for (const weight of weights) {
      total += weight;
    }
    this.#minuteShare = weights.map((weight) => weight / total);
    this.#minuteYears = new Float64Array(MINUTES_PER_DAY);
    for (let j = 0; j + 1 < layout.boundaries.length; j++) {
      const from = layout.boundaries[j];
      const to = layout.boundaries[j + 1];
      this.#minuteYears.fill(context.intervalYears[j] / (to - from), from, to);
    }
  }

  /** Minute of the day of the open and the close of the instruments. */
  get session(): { open: number; close: number } {
    return { open: this.#open, close: this.#close };
  }

  /**
   * Simulates one trading day with the factor volatilities of `day` and the trends `trend`
   * (state after the day step) and returns the session prices per instrument (`L + 1` values).
   */
  simulateDay(day: Readonly<MarketDay>, trend: ArrayLike<number>): Float64Array[] {
    const { layout, config, dayYears, sqrtDayYears } = this.#context;
    const open = this.#open;
    const length = this.#close - open;
    const factorRng = createStream(this.#context.seedKey, `lab/reference/factor/${day.day}`);
    const instrumentRng = createStream(this.#context.seedKey, `lab/reference/idio/${day.day}`);

    const factorPath = factorPathAt(this.#context, day.day);
    const factorDrift = new Float64Array(this.#level.length);
    for (const k of this.#factors) {
      const vol = day.factorVols[k];
      factorDrift[k] =
        trend[k] -
        0.5 * vol * vol * factorPath.convexity[k] -
        (this.#context.levelDecay[k] * (this.#level[k] - factorPath.target[k])) / dayYears;
    }
    const moveFactors = (from: number, to: number): void => {
      let years = 0;
      for (let m = from; m < to; m++) {
        years += this.#minuteYears[m];
      }
      for (const k of this.#factors) {
        const vol = day.factorVols[k];
        this.#level[k] += factorDrift[k] * years + vol * Math.sqrt(years) * normal(factorRng);
      }
    };

    const path = idioPathAt(this.#context, day.day);
    const drift = this.#instruments.map((i) => {
      const alpha = layout.alpha[i];
      const variance = this.#context.idioVariance[i];
      const target =
        expectedLogPath(alpha, path.alphaBefore, variance, path.varianceBefore) -
        this.#context.dividendDrag[i] * path.years;
      return (
        alpha * (path.alphaAfter - path.alphaBefore) -
        0.5 * variance * (path.varianceAfter - path.varianceBefore) -
        this.#context.reversionDecay * (this.#idio[i] - target) -
        this.#context.jumpDrift[i]
      );
    });

    moveFactors(0, open);
    for (const i of this.#instruments) {
      this.#idio[i] +=
        this.#context.sqrtOvernightShare * layout.idioVol[i] * sqrtDayYears * normal(instrumentRng);
    }
    const prices = this.#instruments.map(() => new Float64Array(length + 1));
    for (let j = 0; j <= length; j++) {
      if (j > 0) {
        moveFactors(open + j - 1, open + j);
        const share = this.#minuteShare[j - 1];
        this.#instruments.forEach((i, n) => {
          const vol = layout.idioVol[i];
          this.#idio[i] +=
            drift[n] / length +
            this.#context.sqrtSessionShare *
              vol *
              Math.sqrt(dayYears * share) *
              normal(instrumentRng);
          const jumpProbability = layout.jumpIntensity[i] / (config.tradingDaysPerYear * length);
          if (instrumentRng.nextFloat53() < jumpProbability) {
            this.#idio[i] += normal(instrumentRng, layout.jumpMean[i], layout.jumpSd[i]);
          }
        });
      }
      this.#instruments.forEach((i, n) => {
        let factor = 0;
        for (let l = 0; l < LOADINGS_PER_INSTRUMENT; l++) {
          const index = i * LOADINGS_PER_INSTRUMENT + l;
          factor += layout.loadings[index] * this.#level[layout.loadingFactors[index]];
        }
        prices[n][j] = priceFromLog(layout.logBase[i] + factor + this.#idio[i], config.priceFloor);
      });
    }
    moveFactors(this.#close, MINUTES_PER_DAY);
    return prices;
  }
}
