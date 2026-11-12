import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { normal } from '@app/simulation/util/distributions';
import { createStream } from '@app/simulation/util/random-stream';

import { MarketContext } from '../market-context';
import { LOADINGS_PER_INSTRUMENT } from '../market-layout';
import { MarketDay } from '../models/market-day.model';
import { priceFromLog } from '../price-logic';

/**
 * Test helper, not production code (TS §4.6): simulates the factors and the idiosyncratic
 * components of the given instruments minute by minute with the parameters of the day step
 * (trend and volatility of each factor per day). Jumps occur in each session minute with
 * probability `λ / (261 · L)`. The instruments must share their trading hours.
 */
export class ReferenceSimulation {
  readonly #context: MarketContext;
  readonly #instruments: readonly number[];
  readonly #factors: readonly number[];
  readonly #level: Float64Array;
  readonly #idio: Float64Array;
  readonly #open: number;
  readonly #close: number;

  constructor(context: MarketContext, instruments: readonly number[]) {
    const { layout } = context;
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
  }

  /**
   * Simulates one trading day with the factor volatilities of `day` and the trends `trend`
   * (state after the day step) and returns the session prices per instrument (`L + 1` values).
   */
  simulateDay(day: Readonly<MarketDay>, trend: ArrayLike<number>): Float64Array[] {
    const { layout, config, dayYears, sqrtDayYears } = this.#context;
    const open = this.#open;
    const length = this.#close - open;
    const minuteYears = 1 / (config.tradingDaysPerYear * MINUTES_PER_DAY);
    const factorRng = createStream(this.#context.seedKey, `test/reference/factor/${day.day}`);
    const instrumentRng = createStream(this.#context.seedKey, `test/reference/idio/${day.day}`);

    const moveFactors = (minutes: number): void => {
      for (const k of this.#factors) {
        const vol = day.factorVols[k];
        const years = minutes * minuteYears;
        this.#level[k] +=
          (trend[k] - 0.5 * vol * vol) * years + vol * Math.sqrt(years) * normal(factorRng);
      }
    };

    moveFactors(open);
    for (const i of this.#instruments) {
      this.#idio[i] +=
        this.#context.sqrtOvernightShare * layout.idioVol[i] * sqrtDayYears * normal(instrumentRng);
    }
    const prices = this.#instruments.map(() => new Float64Array(length + 1));
    for (let j = 0; j <= length; j++) {
      if (j > 0) {
        moveFactors(1);
        this.#instruments.forEach((i) => {
          const vol = layout.idioVol[i];
          this.#idio[i] +=
            ((layout.alpha[i] - 0.5 * vol * vol) * dayYears) / length +
            this.#context.sqrtSessionShare *
              vol *
              Math.sqrt(dayYears / length) *
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
    moveFactors(MINUTES_PER_DAY - this.#close);
    return prices;
  }
}
