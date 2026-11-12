import { CENTS_PER_EURO } from '@app/shared/domain/models/money.model';

import { MarketContext } from './market-context';
import { MarketDay } from './models/market-day.model';
import { MarketState } from './models/market-state.model';
import { priceFromLog } from './price-logic';

/**
 * Day step of the indices (TS §6.6) after all instruments: advances the reinvestment factor `R`
 * of every index over the boundaries of the day. At the open of an exchange, the dividends of the
 * constituents that go ex there raise `R` by `I_ref / (I_ref − Σ n_i · D_i / Div)`. `I_ref` is
 * the index level from the previous closes, reduced by the dividends already taken out earlier
 * that day – like index providers that use the previous close. Needs no minute values. Also
 * reports the dividend points per boundary for the distribution pots of the ETFs.
 */
export function stepIndices(context: MarketContext, state: MarketState, out: MarketDay): void {
  const { indices, layout, config } = context;
  const boundaryCount = layout.boundaries.length;
  const points = new Float64Array(boundaryCount);
  for (let x = 0; x < indices.ids.length; x++) {
    const start = indices.memberStart[x];
    const end = indices.memberStart[x + 1];
    let reinvest = state.indexReinvest[x];
    let anyDividend = false;
    points.fill(0);
    for (let n = start; n < end; n++) {
      const i = indices.members[n];
      const cents = out.exDividendCents[i];
      if (cents > 0) {
        points[layout.openBoundary[i]] += (indices.shares[n] * cents) / CENTS_PER_EURO;
        anyDividend = true;
      }
    }
    if (!anyDividend) {
      out.indexReinvest.fill(reinvest, x * boundaryCount, (x + 1) * boundaryCount);
      out.indexDividendPoints.fill(0, x * boundaryCount, (x + 1) * boundaryCount);
      continue;
    }
    const divisor = indices.divisor[x];
    let reference = 0;
    for (let n = start; n < end; n++) {
      const i = indices.members[n];
      reference += indices.shares[n] * priceFromLog(out.prevLogClose[i], config.priceFloor);
    }
    reference /= divisor;
    for (let j = 0; j < boundaryCount; j++) {
      let dividendPoints = 0;
      if (points[j] > 0) {
        dividendPoints = points[j] / divisor;
        reinvest = (reinvest * reference) / (reference - dividendPoints);
        reference -= dividendPoints;
      }
      out.indexReinvest[x * boundaryCount + j] = reinvest;
      out.indexDividendPoints[x * boundaryCount + j] = dividendPoints;
    }
    state.indexReinvest[x] = reinvest;
  }
}
